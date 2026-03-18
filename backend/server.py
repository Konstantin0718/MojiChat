from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import httpx
import base64
import mimetypes

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ.get('MONGO_URL') or os.environ.get('MONGODB_URI')
if not mongo_url:
    raise RuntimeError("MONGO_URL or MONGODB_URI environment variable is required")
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'mojichat_db')]

JWT_SECRET = os.environ.get('JWT_SECRET', 'default_secret')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7

app = FastAPI(title="MojiChat API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)


# Giphy API Key
GIPHY_API_KEY = os.environ.get('GIPHY_API_KEY', '')

# ==================== WEBSOCKET MANAGER ====================

class ConnectionManager:
    def __init__(self):
        # user_id -> list of websocket connections
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # conversation_id -> set of user_ids
        self.conversation_subscribers: Dict[str, set] = {}
    
    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        
        # Update user online status
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"is_online": True, "last_seen": datetime.now(timezone.utc).isoformat()}}
        )
        
        # Notify contacts about online status
        await self.broadcast_online_status(user_id, True)
        
        logger.info(f"WebSocket connected: {user_id} (total: {len(self.active_connections[user_id])})")
    
    async def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
                # Update user offline status
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$set": {"is_online": False, "last_seen": datetime.now(timezone.utc).isoformat()}}
                )
                await self.broadcast_online_status(user_id, False)
        
        logger.info(f"WebSocket disconnected: {user_id}")
    
    async def broadcast_online_status(self, user_id: str, is_online: bool):
        """Notify all contacts about user's online status"""
        # Get user's conversations
        conversations = await db.conversations.find(
            {"participant_ids": user_id}
        ).to_list(100)
        
        contact_ids = set()
        for conv in conversations:
            contact_ids.update(conv["participant_ids"])
        contact_ids.discard(user_id)
        
        message = {
            "type": "online_status",
            "user_id": user_id,
            "is_online": is_online,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        for contact_id in contact_ids:
            await self.send_to_user(contact_id, message)
    
    async def send_to_user(self, user_id: str, message: dict):
        """Send message to all connections of a user"""
        if user_id in self.active_connections:
            disconnected = []
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending to {user_id}: {e}")
                    disconnected.append(connection)
            
            # Clean up dead connections
            for conn in disconnected:
                if conn in self.active_connections[user_id]:
                    self.active_connections[user_id].remove(conn)
    
    async def broadcast_to_conversation(self, conversation_id: str, message: dict, exclude_user: str = None):
        """Send message to all participants of a conversation"""
        conv = await db.conversations.find_one(
            {"conversation_id": conversation_id},
            {"_id": 0, "participant_ids": 1}
        )
        
        if conv:
            for user_id in conv["participant_ids"]:
                if user_id != exclude_user:
                    await self.send_to_user(user_id, message)
    
    async def send_typing_indicator(self, conversation_id: str, user_id: str, user_name: str, is_typing: bool):
        """Send typing indicator to conversation participants"""
        message = {
            "type": "typing",
            "conversation_id": conversation_id,
            "user_id": user_id,
            "user_name": user_name,
            "is_typing": is_typing,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await self.broadcast_to_conversation(conversation_id, message, exclude_user=user_id)
    
    async def send_new_message(self, conversation_id: str, message_data: dict, sender_id: str):
        """Send new message notification to conversation participants"""
        message = {
            "type": "new_message",
            "conversation_id": conversation_id,
            "message": message_data,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await self.broadcast_to_conversation(conversation_id, message, exclude_user=sender_id)
    
    async def send_message_read(self, conversation_id: str, message_id: str, reader_id: str):
        """Send read receipt to conversation"""
        message = {
            "type": "message_read",
            "conversation_id": conversation_id,
            "message_id": message_id,
            "reader_id": reader_id,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await self.broadcast_to_conversation(conversation_id, message, exclude_user=reader_id)

# Global WebSocket manager
ws_manager = ConnectionManager()

# Supported languages for translation
SUPPORTED_LANGUAGES = {
    "en": "English",
    "bg": "Bulgarian", 
    "de": "German",
    "es": "Spanish",
    "fr": "French",
    "it": "Italian",
    "ru": "Russian",
    "tr": "Turkish",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "ar": "Arabic",
    "pt": "Portuguese",
    "nl": "Dutch",
    "pl": "Polish",
    "uk": "Ukrainian"
}

# Country to language mapping (default)
COUNTRY_LANGUAGE_MAP = {
    "BG": "bg", "DE": "de", "AT": "de", "CH": "de",
    "US": "en", "GB": "en", "AU": "en", "CA": "en",
    "ES": "es", "MX": "es", "AR": "es",
    "FR": "fr", "BE": "fr",
    "IT": "it",
    "RU": "ru",
    "TR": "tr",
    "CN": "zh", "TW": "zh",
    "JP": "ja",
    "KR": "ko",
    "SA": "ar", "AE": "ar",
    "BR": "pt", "PT": "pt",
    "NL": "nl",
    "PL": "pl",
    "UA": "uk"
}

# Animated emoji sets
ANIMATED_EMOJIS = {
    "love": ["💕", "💖", "💗", "💓", "💞", "💝", "😍", "🥰"],
    "happy": ["😊", "😄", "🎉", "🥳", "✨", "🌟", "💫", "🎊"],
    "sad": ["😢", "😭", "💔", "🥺", "😞", "😔", "🌧️", "💧"],
    "angry": ["😠", "😤", "💢", "🔥", "⚡", "💥", "😡", "👊"],
    "cool": ["😎", "🆒", "🤙", "👑", "💎", "🌈", "🚀", "⭐"],
    "food": ["🍕", "🍔", "🌮", "🍣", "🍜", "🍩", "🎂", "🍪"],
    "nature": ["🌸", "🌺", "🌻", "🌼", "🌷", "🌹", "🍀", "🌿"],
    "weather": ["☀️", "🌤️", "⛅", "🌧️", "⛈️", "❄️", "🌈", "🌙"]
}

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: datetime
    is_online: bool = False
    last_seen: Optional[datetime] = None

class ConversationCreate(BaseModel):
    participant_ids: List[str]
    name: Optional[str] = None
    is_group: bool = False

class ConversationResponse(BaseModel):
    conversation_id: str
    participants: List[UserResponse]
    name: Optional[str] = None
    is_group: bool
    created_at: datetime
    last_message: Optional[dict] = None
    unread_count: int = 0

class MessageCreate(BaseModel):
    content: str
    message_type: str = "text"  # text, image, video, audio, file
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    duration: Optional[int] = None  # For audio/video in seconds

class MessageResponse(BaseModel):
    message_id: str
    conversation_id: str
    sender_id: str
    sender_name: str
    content: str
    emoji_content: str
    message_type: str = "text"
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    duration: Optional[int] = None
    translations: Dict[str, str] = {}
    reactions: Dict[str, List[str]] = {}
    created_at: datetime
    read_by: List[str] = []

class ReactionCreate(BaseModel):
    emoji: str

class UserLanguageUpdate(BaseModel):
    preferred_language: str
    country_code: Optional[str] = None

class TypingStatus(BaseModel):
    is_typing: bool

class EmojiConvertRequest(BaseModel):
    text: str

class EmojiConvertResponse(BaseModel):
    original: str
    emoji: str

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

class EmailVerificationRequest(BaseModel):
    email: EmailStr

class PhoneVerificationRequest(BaseModel):
    phone_number: str

class PhoneVerificationConfirm(BaseModel):
    phone_number: str
    verification_code: str
    name: Optional[str] = None

class PhoneLoginRequest(BaseModel):
    phone_number: str
    verification_code: str

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRATION_DAYS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    # Check cookie first
    session_token = request.cookies.get("session_token")
    
    # Then check Authorization header
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Try JWT token first
    try:
        payload = jwt.decode(session_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        if user_id:
            user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
            if user:
                # Update online status
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$set": {"is_online": True, "last_seen": datetime.now(timezone.utc).isoformat()}}
                )
                return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        pass
    
    # Try session token (Google OAuth)
    session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if session:
        expires_at = session.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        
        user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
        if user:
            await db.users.update_one(
                {"user_id": user["user_id"]},
                {"$set": {"is_online": True, "last_seen": datetime.now(timezone.utc).isoformat()}}
            )
            return user
    
    raise HTTPException(status_code=401, detail="Invalid token")

# ==================== EMOJI CONVERSION ====================

async def convert_text_to_emoji(text: str) -> str:
    """Convert text to emojis using AI"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            return fallback_emoji_convert(text)
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"emoji-convert-{uuid.uuid4().hex[:8]}",
            system_message="""You are an emoji converter. Convert the given text into a sequence of emojis that represent the meaning of the words. 
Rules:
1. Each word should be represented by 1-3 relevant emojis
2. Keep the order of concepts
3. Return ONLY emojis, no text
4. Make it fun and expressive
5. If a word has no good emoji, use a related concept

Example: "I love coffee in the morning" -> "👋❤️☕🌅"
Example: "Let's go to the beach" -> "🏃‍♂️🏖️🌊"
Example: "Happy birthday!" -> "🎉🎂🥳"
"""
        ).with_model("openai", "gpt-4o")
        
        user_message = UserMessage(text=f"Convert to emojis: {text}")
        response = await chat.send_message(user_message)
        return response.strip() if response else fallback_emoji_convert(text)
        
    except Exception as e:
        logger.error(f"AI emoji conversion error: {e}")
        return fallback_emoji_convert(text)

def fallback_emoji_convert(text: str) -> str:
    """Fallback emoji conversion using character mapping"""
    emoji_map = {
        'a': '🅰️', 'b': '🅱️', 'c': '©️', 'd': '🇩', 'e': '📧', 'f': '🎏',
        'g': '🇬', 'h': '♓', 'i': 'ℹ️', 'j': '🎷', 'k': '🎋', 'l': '🕒',
        'm': 'Ⓜ️', 'n': '♑', 'o': '⭕', 'p': '🅿️', 'q': '🎯', 'r': '®️',
        's': '💲', 't': '✝️', 'u': '⛎', 'v': '✅', 'w': '〰️', 'x': '❌',
        'y': '💴', 'z': '💤', ' ': '➖', '!': '❗', '?': '❓', '.': '⚫',
        ',': '🔸', '0': '0️⃣', '1': '1️⃣', '2': '2️⃣', '3': '3️⃣', '4': '4️⃣',
        '5': '5️⃣', '6': '6️⃣', '7': '7️⃣', '8': '8️⃣', '9': '9️⃣'
    }
    result = ""
    for char in text.lower():
        result += emoji_map.get(char, '🔹')
    return result

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register")
async def register(user_data: UserCreate, response: Response):
    # Check if user exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    hashed_pwd = hash_password(user_data.password)
    
    user_doc = {
        "user_id": user_id,
        "email": user_data.email,
        "name": user_data.name,
        "password": hashed_pwd,
        "picture": None,
        "is_online": True,
        "last_seen": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "preferred_language": "en",
        "country_code": None,
        "email_verified": False,
        "phone_number": None,
        "phone_verified": False
    }
    
    await db.users.insert_one(user_doc)
    
    token = create_token(user_id)
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60
    )
    
    return {
        "user_id": user_id,
        "email": user_data.email,
        "name": user_data.name,
        "picture": None,
        "token": token
    }

@api_router.post("/auth/login")
async def login(user_data: UserLogin, response: Response):
    user = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user.get("password"):
        raise HTTPException(status_code=401, detail="Please use Google login for this account")
    
    if not verify_password(user_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["user_id"])
    
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"is_online": True, "last_seen": datetime.now(timezone.utc).isoformat()}}
    )
    
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60
    )
    
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user["name"],
        "picture": user.get("picture"),
        "token": token
    }

@api_router.post("/auth/session")
async def process_google_session(request: Request, response: Response):
    """Process Google OAuth session_id from Emergent Auth"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Call Emergent Auth to get user data
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id}
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid session")
            
            data = resp.json()
        except Exception as e:
            logger.error(f"Error calling Emergent Auth: {e}")
            raise HTTPException(status_code=500, detail="Auth service error")
    
    email = data.get("email")
    name = data.get("name")
    picture = data.get("picture")
    emergent_session_token = data.get("session_token")
    
    # Check if user exists
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        # Update user info
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "name": name,
                "picture": picture,
                "is_online": True,
                "last_seen": datetime.now(timezone.utc).isoformat()
            }}
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "password": None,
            "is_online": True,
            "last_seen": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "preferred_language": "en",
            "country_code": None
        }
        await db.users.insert_one(user_doc)
    
    # Store session
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": emergent_session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    response.set_cookie(
        key="session_token",
        value=emergent_session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    return {
        "user_id": user_id,
        "email": email,
        "name": name,
        "picture": picture,
        "token": emergent_session_token
    }

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user["name"],
        "picture": user.get("picture"),
        "is_online": user.get("is_online", False),
        "last_seen": user.get("last_seen"),
        "preferred_language": user.get("preferred_language", "en"),
        "country_code": user.get("country_code")
    }

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    try:
        user = await get_current_user(request)
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"is_online": False, "last_seen": datetime.now(timezone.utc).isoformat()}}
        )
        await db.user_sessions.delete_many({"user_id": user["user_id"]})
    except:
        pass
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out"}

# ==================== PASSWORD RESET ====================

@api_router.post("/auth/forgot-password")
async def forgot_password(data: PasswordResetRequest):
    """Send password reset email"""
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    
    # Always return success to prevent email enumeration
    if not user:
        return {"message": "If this email exists, a reset link has been sent"}
    
    # Generate reset token
    reset_token = uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    
    # Store reset token
    await db.password_resets.delete_many({"email": data.email})
    await db.password_resets.insert_one({
        "email": data.email,
        "token": reset_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # In production, send email here
    # For now, return token for testing
    logger.info(f"Password reset token for {data.email}: {reset_token}")
    
    return {
        "message": "If this email exists, a reset link has been sent",
        "reset_token": reset_token  # Remove in production
    }

@api_router.post("/auth/reset-password")
async def reset_password(data: PasswordResetConfirm):
    """Reset password using token"""
    reset_request = await db.password_resets.find_one({"token": data.token}, {"_id": 0})
    
    if not reset_request:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    
    expires_at = datetime.fromisoformat(reset_request["expires_at"].replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expires_at:
        await db.password_resets.delete_one({"token": data.token})
        raise HTTPException(status_code=400, detail="Reset token has expired")
    
    # Update password
    hashed_pwd = hash_password(data.new_password)
    await db.users.update_one(
        {"email": reset_request["email"]},
        {"$set": {"password": hashed_pwd}}
    )
    
    # Delete used token
    await db.password_resets.delete_one({"token": data.token})
    
    return {"message": "Password has been reset successfully"}

# ==================== EMAIL VERIFICATION ====================

@api_router.post("/auth/send-verification")
async def send_verification_email(data: EmailVerificationRequest):
    """Send email verification link"""
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.get("email_verified"):
        return {"message": "Email already verified"}
    
    # Generate verification token
    verification_token = uuid.uuid4().hex
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    
    # Store verification token
    await db.email_verifications.delete_many({"email": data.email})
    await db.email_verifications.insert_one({
        "email": data.email,
        "token": verification_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # In production, send email here
    logger.info(f"Email verification token for {data.email}: {verification_token}")
    
    return {
        "message": "Verification email sent",
        "verification_token": verification_token  # Remove in production
    }

@api_router.get("/auth/verify-email/{token}")
async def verify_email(token: str):
    """Verify email using token"""
    verification = await db.email_verifications.find_one({"token": token}, {"_id": 0})
    
    if not verification:
        raise HTTPException(status_code=400, detail="Invalid verification token")
    
    expires_at = datetime.fromisoformat(verification["expires_at"].replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expires_at:
        await db.email_verifications.delete_one({"token": token})
        raise HTTPException(status_code=400, detail="Verification token has expired")
    
    # Mark email as verified
    await db.users.update_one(
        {"email": verification["email"]},
        {"$set": {"email_verified": True, "email_verified_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Delete used token
    await db.email_verifications.delete_one({"token": token})
    
    return {"message": "Email verified successfully"}

# ==================== PHONE AUTHENTICATION ====================

@api_router.post("/auth/phone/send-code")
async def send_phone_verification_code(data: PhoneVerificationRequest):
    """Send verification code to phone number (Firebase Phone Auth)"""
    # Normalize phone number
    phone = data.phone_number.strip()
    if not phone.startswith('+'):
        phone = '+' + phone
    
    # Generate 6-digit code
    verification_code = str(uuid.uuid4().int)[:6]
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    # Store verification code
    await db.phone_verifications.delete_many({"phone_number": phone})
    await db.phone_verifications.insert_one({
        "phone_number": phone,
        "code": verification_code,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "attempts": 0
    })
    
    # In production, use Firebase Phone Auth or SMS service
    # For now, log the code for testing
    logger.info(f"Phone verification code for {phone}: {verification_code}")
    
    return {
        "message": "Verification code sent",
        "phone_number": phone,
        "verification_code": verification_code  # Remove in production - for testing only
    }

@api_router.post("/auth/phone/verify")
async def verify_phone_and_register(data: PhoneVerificationConfirm, response: Response):
    """Verify phone code and register/login user"""
    phone = data.phone_number.strip()
    if not phone.startswith('+'):
        phone = '+' + phone
    
    verification = await db.phone_verifications.find_one({"phone_number": phone}, {"_id": 0})
    
    if not verification:
        raise HTTPException(status_code=400, detail="No verification code sent to this number")
    
    # Check attempts
    if verification.get("attempts", 0) >= 5:
        await db.phone_verifications.delete_one({"phone_number": phone})
        raise HTTPException(status_code=400, detail="Too many attempts. Please request a new code")
    
    # Check expiration
    expires_at = datetime.fromisoformat(verification["expires_at"].replace('Z', '+00:00'))
    if datetime.now(timezone.utc) > expires_at:
        await db.phone_verifications.delete_one({"phone_number": phone})
        raise HTTPException(status_code=400, detail="Verification code has expired")
    
    # Verify code
    if verification["code"] != data.verification_code:
        await db.phone_verifications.update_one(
            {"phone_number": phone},
            {"$inc": {"attempts": 1}}
        )
        raise HTTPException(status_code=400, detail="Invalid verification code")
    
    # Delete verification record
    await db.phone_verifications.delete_one({"phone_number": phone})
    
    # Check if user exists with this phone
    existing_user = await db.users.find_one({"phone_number": phone}, {"_id": 0})
    
    if existing_user:
        # Login existing user
        user_id = existing_user["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "is_online": True,
                "last_seen": datetime.now(timezone.utc).isoformat(),
                "phone_verified": True
            }}
        )
    else:
        # Register new user
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_name = data.name or f"User {phone[-4:]}"
        
        user_doc = {
            "user_id": user_id,
            "email": None,
            "phone_number": phone,
            "name": user_name,
            "password": None,
            "picture": None,
            "is_online": True,
            "last_seen": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "preferred_language": "bg",
            "country_code": "BG",
            "phone_verified": True
        }
        await db.users.insert_one(user_doc)
    
    # Create session token
    token = create_token(user_id)
    
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=JWT_EXPIRATION_DAYS * 24 * 60 * 60
    )
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
    
    return {
        "user_id": user_id,
        "phone_number": phone,
        "name": user.get("name"),
        "email": user.get("email"),
        "picture": user.get("picture"),
        "token": token,
        "is_new_user": not existing_user
    }

# ==================== USER ENDPOINTS ====================

@api_router.get("/users/search")
async def search_users(q: str, request: Request):
    current_user = await get_current_user(request)
    
    users = await db.users.find(
        {
            "$and": [
                {"user_id": {"$ne": current_user["user_id"]}},
                {"$or": [
                    {"name": {"$regex": q, "$options": "i"}},
                    {"email": {"$regex": q, "$options": "i"}}
                ]}
            ]
        },
        {"_id": 0, "password": 0}
    ).to_list(20)
    
    return users

@api_router.get("/users/{user_id}")
async def get_user(user_id: str, request: Request):
    await get_current_user(request)
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# ==================== BLOCKED USERS ====================

@api_router.get("/users/blocked")
async def get_blocked_users(request: Request):
    """Get list of blocked users"""
    current_user = await get_current_user(request)
    
    blocked = await db.blocked_users.find(
        {"blocker_id": current_user["user_id"]},
        {"_id": 0}
    ).to_list(100)
    
    # Get user details
    blocked_ids = [b["blocked_id"] for b in blocked]
    users = await db.users.find(
        {"user_id": {"$in": blocked_ids}},
        {"_id": 0, "password": 0}
    ).to_list(100)
    
    result = []
    for user in users:
        block_record = next((b for b in blocked if b["blocked_id"] == user["user_id"]), None)
        result.append({
            **user,
            "blocked_at": block_record["blocked_at"] if block_record else None
        })
    
    return result

@api_router.post("/users/{user_id}/block")
async def block_user(user_id: str, request: Request):
    """Block a user"""
    current_user = await get_current_user(request)
    
    if user_id == current_user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot block yourself")
    
    # Check if user exists
    target_user = await db.users.find_one({"user_id": user_id})
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if already blocked
    existing = await db.blocked_users.find_one({
        "blocker_id": current_user["user_id"],
        "blocked_id": user_id
    })
    
    if existing:
        return {"message": "User already blocked"}
    
    # Create block record
    await db.blocked_users.insert_one({
        "blocker_id": current_user["user_id"],
        "blocked_id": user_id,
        "blocked_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "User blocked successfully"}

@api_router.delete("/users/{user_id}/block")
async def unblock_user(user_id: str, request: Request):
    """Unblock a user"""
    current_user = await get_current_user(request)
    
    result = await db.blocked_users.delete_one({
        "blocker_id": current_user["user_id"],
        "blocked_id": user_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Block record not found")
    
    return {"message": "User unblocked successfully"}

# ==================== STATUS/STORIES ====================

@api_router.get("/statuses")
async def get_statuses(request: Request):
    """Get status updates from contacts"""
    current_user = await get_current_user(request)
    
    # Get statuses from last 24 hours
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    
    # Get user's conversations to find contacts
    conversations = await db.conversations.find(
        {"participant_ids": current_user["user_id"]},
        {"_id": 0}
    ).to_list(100)
    
    contact_ids = set()
    for conv in conversations:
        contact_ids.update(conv["participant_ids"])
    contact_ids.discard(current_user["user_id"])
    contact_ids.add(current_user["user_id"])  # Include own statuses
    
    statuses = await db.statuses.find(
        {
            "user_id": {"$in": list(contact_ids)},
            "created_at": {"$gte": cutoff}
        },
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Get user info for each status
    user_ids = list(set(s["user_id"] for s in statuses))
    users = await db.users.find(
        {"user_id": {"$in": user_ids}},
        {"_id": 0, "password": 0}
    ).to_list(100)
    user_map = {u["user_id"]: u for u in users}
    
    for status in statuses:
        user_info = user_map.get(status["user_id"], {})
        status["user_name"] = user_info.get("name", "Unknown")
        status["user_picture"] = user_info.get("picture")
    
    # Separate into my, recent, and viewed
    my_statuses = [s for s in statuses if s["user_id"] == current_user["user_id"]]
    other_statuses = [s for s in statuses if s["user_id"] != current_user["user_id"]]
    
    recent = [s for s in other_statuses if current_user["user_id"] not in s.get("viewed_by", [])]
    viewed = [s for s in other_statuses if current_user["user_id"] in s.get("viewed_by", [])]
    
    return {
        "my_statuses": my_statuses,
        "recent": recent,
        "viewed": viewed
    }

@api_router.post("/statuses")
async def create_status(request: Request):
    """Create a new status update"""
    current_user = await get_current_user(request)
    body = await request.json()
    
    status_id = f"status_{uuid.uuid4().hex[:12]}"
    status_doc = {
        "status_id": status_id,
        "user_id": current_user["user_id"],
        "content_type": body.get("content_type", "text"),
        "text_content": body.get("text_content"),
        "background_color": body.get("background_color", "#8B5CF6"),
        "content_url": body.get("file_url"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
        "viewed_by": []
    }
    
    await db.statuses.insert_one(status_doc)
    
    return {
        "status_id": status_id,
        "message": "Status created successfully"
    }

@api_router.post("/statuses/{status_id}/view")
async def view_status(status_id: str, request: Request):
    """Mark status as viewed"""
    current_user = await get_current_user(request)
    
    await db.statuses.update_one(
        {"status_id": status_id},
        {"$addToSet": {"viewed_by": current_user["user_id"]}}
    )
    
    return {"message": "Status marked as viewed"}

@api_router.delete("/statuses/{status_id}")
async def delete_status(status_id: str, request: Request):
    """Delete own status"""
    current_user = await get_current_user(request)
    
    result = await db.statuses.delete_one({
        "status_id": status_id,
        "user_id": current_user["user_id"]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Status not found or not yours")
    
    return {"message": "Status deleted"}

# ==================== MESSAGE FORWARDING ====================

@api_router.post("/messages/{message_id}/forward")
async def forward_message(message_id: str, request: Request):
    """Forward a message to other conversations"""
    current_user = await get_current_user(request)
    body = await request.json()
    conversation_ids = body.get("conversation_ids", [])
    
    if not conversation_ids:
        raise HTTPException(status_code=400, detail="No conversations specified")
    
    # Get original message
    original = await db.messages.find_one({"message_id": message_id}, {"_id": 0})
    if not original:
        raise HTTPException(status_code=404, detail="Message not found")
    
    forwarded_messages = []
    for conv_id in conversation_ids:
        # Check user is participant
        conv = await db.conversations.find_one({
            "conversation_id": conv_id,
            "participant_ids": current_user["user_id"]
        })
        if not conv:
            continue
        
        # Create forwarded message
        new_msg_id = f"msg_{uuid.uuid4().hex[:12]}"
        new_msg = {
            "message_id": new_msg_id,
            "conversation_id": conv_id,
            "sender_id": current_user["user_id"],
            "sender_name": current_user.get("name"),
            "content": original.get("content"),
            "emoji_content": original.get("emoji_content"),
            "message_type": original.get("message_type", "text"),
            "file_url": original.get("file_url"),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "read_by": [current_user["user_id"]],
            "reactions": {},
            "forwarded_from": message_id
        }
        
        await db.messages.insert_one(new_msg)
        forwarded_messages.append(new_msg_id)
    
    return {
        "message": f"Forwarded to {len(forwarded_messages)} conversations",
        "forwarded_message_ids": forwarded_messages
    }

# ==================== CONVERSATION ENDPOINTS ====================

@api_router.post("/conversations")
async def create_conversation(conv_data: ConversationCreate, request: Request):
    current_user = await get_current_user(request)
    
    # Add current user to participants
    all_participants = list(set([current_user["user_id"]] + conv_data.participant_ids))
    
    if len(all_participants) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 participants")
    
    # For 1-to-1, check if conversation exists
    if not conv_data.is_group and len(all_participants) == 2:
        existing = await db.conversations.find_one({
            "is_group": False,
            "participant_ids": {"$all": all_participants, "$size": 2}
        }, {"_id": 0})
        if existing:
            return existing
    
    conversation_id = f"conv_{uuid.uuid4().hex[:12]}"
    conv_doc = {
        "conversation_id": conversation_id,
        "participant_ids": all_participants,
        "name": conv_data.name if conv_data.is_group else None,
        "is_group": conv_data.is_group,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["user_id"]
    }
    
    await db.conversations.insert_one(conv_doc)
    
    return {
        "conversation_id": conversation_id,
        "participant_ids": all_participants,
        "name": conv_doc["name"],
        "is_group": conv_data.is_group,
        "created_at": conv_doc["created_at"]
    }

@api_router.get("/conversations")
async def get_conversations(request: Request):
    current_user = await get_current_user(request)
    
    conversations = await db.conversations.find(
        {"participant_ids": current_user["user_id"]},
        {"_id": 0}
    ).to_list(100)
    
    result = []
    for conv in conversations:
        # Get participants info
        participants = await db.users.find(
            {"user_id": {"$in": conv["participant_ids"]}},
            {"_id": 0, "password": 0}
        ).to_list(100)
        
        # Get last message
        last_msg = await db.messages.find_one(
            {"conversation_id": conv["conversation_id"]},
            {"_id": 0},
            sort=[("created_at", -1)]
        )
        
        # Count unread
        unread = await db.messages.count_documents({
            "conversation_id": conv["conversation_id"],
            "sender_id": {"$ne": current_user["user_id"]},
            "read_by": {"$nin": [current_user["user_id"]]}
        })
        
        result.append({
            "conversation_id": conv["conversation_id"],
            "participants": participants,
            "name": conv.get("name"),
            "is_group": conv.get("is_group", False),
            "created_at": conv["created_at"],
            "last_message": last_msg,
            "unread_count": unread
        })
    
    # Sort by last message time
    result.sort(key=lambda x: x.get("last_message", {}).get("created_at", "") if x.get("last_message") else "", reverse=True)
    
    return result

@api_router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, request: Request):
    current_user = await get_current_user(request)
    
    conv = await db.conversations.find_one(
        {"conversation_id": conversation_id, "participant_ids": current_user["user_id"]},
        {"_id": 0}
    )
    
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    participants = await db.users.find(
        {"user_id": {"$in": conv["participant_ids"]}},
        {"_id": 0, "password": 0}
    ).to_list(100)
    
    return {
        "conversation_id": conv["conversation_id"],
        "participants": participants,
        "name": conv.get("name"),
        "is_group": conv.get("is_group", False),
        "created_at": conv["created_at"]
    }

@api_router.post("/conversations/{conversation_id}/members")
async def add_member(conversation_id: str, request: Request):
    current_user = await get_current_user(request)
    body = await request.json()
    user_id = body.get("user_id")
    
    conv = await db.conversations.find_one(
        {"conversation_id": conversation_id, "participant_ids": current_user["user_id"], "is_group": True},
        {"_id": 0}
    )
    
    if not conv:
        raise HTTPException(status_code=404, detail="Group not found")
    
    await db.conversations.update_one(
        {"conversation_id": conversation_id},
        {"$addToSet": {"participant_ids": user_id}}
    )
    
    return {"message": "Member added"}

# ==================== MESSAGE ENDPOINTS ====================

@api_router.post("/conversations/{conversation_id}/messages")
async def send_message(conversation_id: str, msg_data: MessageCreate, request: Request):
    current_user = await get_current_user(request)
    
    conv = await db.conversations.find_one(
        {"conversation_id": conversation_id, "participant_ids": current_user["user_id"]},
        {"_id": 0}
    )
    
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # Convert text to emoji (only for text messages)
    emoji_content = ""
    translations = {}  # NO AUTO-TRANSLATION - send message as-is
    
    if msg_data.message_type == "text" and msg_data.content:
        emoji_content = await convert_text_to_emoji(msg_data.content)
        # Removed auto-translation logic - messages are sent exactly as received
    
    message_id = f"msg_{uuid.uuid4().hex[:12]}"
    msg_doc = {
        "message_id": message_id,
        "conversation_id": conversation_id,
        "sender_id": current_user["user_id"],
        "sender_name": current_user["name"],
        "content": msg_data.content,
        "emoji_content": emoji_content,
        "message_type": msg_data.message_type,
        "file_url": msg_data.file_url,
        "file_name": msg_data.file_name,
        "file_size": msg_data.file_size,
        "duration": msg_data.duration,
        "translations": translations,
        "reactions": {},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read_by": [current_user["user_id"]]
    }
    
    await db.messages.insert_one(msg_doc)
    
    # Clear typing status
    await db.typing_status.delete_one({
        "conversation_id": conversation_id,
        "user_id": current_user["user_id"]
    })
    
    # Prepare response
    response_data = {
        "message_id": message_id,
        "conversation_id": conversation_id,
        "sender_id": current_user["user_id"],
        "sender_name": current_user["name"],
        "content": msg_data.content,
        "emoji_content": emoji_content,
        "message_type": msg_data.message_type,
        "file_url": msg_data.file_url,
        "file_name": msg_data.file_name,
        "file_size": msg_data.file_size,
        "duration": msg_data.duration,
        "translations": translations,
        "reactions": {},
        "created_at": msg_doc["created_at"],
        "read_by": msg_doc["read_by"]
    }
    
    # Broadcast new message via WebSocket
    await ws_manager.send_new_message(conversation_id, response_data, current_user["user_id"])
    
    return response_data

@api_router.get("/conversations/{conversation_id}/messages")
async def get_messages(conversation_id: str, request: Request, limit: int = 50, before: Optional[str] = None):
    current_user = await get_current_user(request)
    
    conv = await db.conversations.find_one(
        {"conversation_id": conversation_id, "participant_ids": current_user["user_id"]},
        {"_id": 0}
    )
    
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    query = {"conversation_id": conversation_id}
    if before:
        query["created_at"] = {"$lt": before}
    
    messages = await db.messages.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # Mark as read
    await db.messages.update_many(
        {
            "conversation_id": conversation_id,
            "sender_id": {"$ne": current_user["user_id"]},
            "read_by": {"$nin": [current_user["user_id"]]}
        },
        {"$addToSet": {"read_by": current_user["user_id"]}}
    )
    
    return list(reversed(messages))

# ==================== TYPING & STATUS ====================

@api_router.post("/conversations/{conversation_id}/typing")
async def set_typing(conversation_id: str, status: TypingStatus, request: Request):
    current_user = await get_current_user(request)
    
    if status.is_typing:
        await db.typing_status.update_one(
            {"conversation_id": conversation_id, "user_id": current_user["user_id"]},
            {"$set": {
                "conversation_id": conversation_id,
                "user_id": current_user["user_id"],
                "user_name": current_user["name"],
                "timestamp": datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )
    else:
        await db.typing_status.delete_one({
            "conversation_id": conversation_id,
            "user_id": current_user["user_id"]
        })
    
    return {"status": "ok"}

@api_router.get("/conversations/{conversation_id}/typing")
async def get_typing(conversation_id: str, request: Request):
    current_user = await get_current_user(request)
    
    # Get typing users from last 5 seconds
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()
    
    typing_users = await db.typing_status.find(
        {
            "conversation_id": conversation_id,
            "user_id": {"$ne": current_user["user_id"]},
            "timestamp": {"$gt": cutoff}
        },
        {"_id": 0}
    ).to_list(10)
    
    return typing_users

@api_router.post("/users/heartbeat")
async def heartbeat(request: Request):
    """Update user's online status"""
    try:
        current_user = await get_current_user(request)
        await db.users.update_one(
            {"user_id": current_user["user_id"]},
            {"$set": {"is_online": True, "last_seen": datetime.now(timezone.utc).isoformat()}}
        )
        return {"status": "ok"}
    except:
        return {"status": "ok"}

# ==================== EMOJI CONVERSION ENDPOINT ====================

@api_router.post("/emoji/convert", response_model=EmojiConvertResponse)
async def convert_emoji(data: EmojiConvertRequest, request: Request):
    await get_current_user(request)
    
    emoji = await convert_text_to_emoji(data.text)
    return {"original": data.text, "emoji": emoji}

# ==================== TRANSLATION ====================

async def translate_text(text: str, target_language: str, source_language: str = "auto") -> str:
    """Translate text to target language using AI"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            return text
        
        lang_name = SUPPORTED_LANGUAGES.get(target_language, "English")
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"translate-{uuid.uuid4().hex[:8]}",
            system_message=f"""You are a professional translator. Translate the given text to {lang_name}.
Rules:
1. Return ONLY the translated text, nothing else
2. Preserve the tone and emotion of the original
3. ALWAYS translate the text to {lang_name}, even if it appears to already be in that language
4. Keep names, brands, and technical terms unchanged
5. Maintain formatting (punctuation, capitalization)"""
        ).with_model("openai", "gpt-4o")
        
        user_message = UserMessage(text=f"Translate to {lang_name}: {text}")
        response = await chat.send_message(user_message)
        return response.strip() if response else text
        
    except Exception as e:
        logger.error(f"Translation error: {e}")
        return text

@api_router.post("/translate")
async def translate_endpoint(request: Request):
    """Translate text to target language with auto-detect"""
    current_user = await get_current_user(request)
    body = await request.json()
    
    text = body.get("text", "")
    target_language = body.get("target_language", current_user.get("preferred_language", "en"))
    
    # If target_language is "auto", detect and use user's preferred language
    if target_language == "auto":
        target_language = current_user.get("preferred_language", "en")
    
    translated = await translate_text(text, target_language)
    return {
        "original": text, 
        "translated": translated, 
        "language": target_language,
        "auto_detected": True
    }

# ==================== USER LANGUAGE SETTINGS ====================

@api_router.put("/users/language")
async def update_language(data: UserLanguageUpdate, request: Request):
    """Update user's preferred language"""
    current_user = await get_current_user(request)
    
    if data.preferred_language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Language not supported. Supported: {list(SUPPORTED_LANGUAGES.keys())}")
    
    update_data = {"preferred_language": data.preferred_language}
    if data.country_code:
        update_data["country_code"] = data.country_code
    
    await db.users.update_one(
        {"user_id": current_user["user_id"]},
        {"$set": update_data}
    )
    
    return {"message": "Language updated", "preferred_language": data.preferred_language}

@api_router.get("/languages")
async def get_languages():
    """Get list of supported languages"""
    return {"languages": SUPPORTED_LANGUAGES}

# ==================== FILE UPLOAD ====================

@api_router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...)):
    """Upload a file (image, video, audio, document)"""
    current_user = await get_current_user(request)
    
    # Validate file size (max 50MB)
    MAX_SIZE = 50 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum 50MB")
    
    # Generate unique filename
    ext = Path(file.filename).suffix.lower() if file.filename else ""
    file_id = f"{uuid.uuid4().hex[:16]}{ext}"
    file_path = UPLOADS_DIR / file_id
    
    # Save file
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Determine file type
    mime_type = file.content_type or mimetypes.guess_type(file.filename)[0] or "application/octet-stream"
    if mime_type.startswith("image/"):
        file_type = "image"
    elif mime_type.startswith("video/"):
        file_type = "video"
    elif mime_type.startswith("audio/"):
        file_type = "audio"
    else:
        file_type = "file"
    
    # Build URL
    file_url = f"/api/files/{file_id}"
    
    return {
        "file_id": file_id,
        "file_url": file_url,
        "file_name": file.filename,
        "file_size": len(content),
        "file_type": file_type,
        "mime_type": mime_type
    }

@api_router.get("/files/{file_id}")
async def get_file(file_id: str):
    """Serve uploaded file"""
    file_path = UPLOADS_DIR / file_id
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    mime_type = mimetypes.guess_type(file_id)[0] or "application/octet-stream"
    
    with open(file_path, "rb") as f:
        content = f.read()
    
    return Response(content=content, media_type=mime_type)

# ==================== VOICE MESSAGE ====================

@api_router.post("/voice/upload")
async def upload_voice(request: Request):
    """Upload voice message as base64"""
    current_user = await get_current_user(request)
    body = await request.json()
    
    audio_data = body.get("audio_data")  # base64 encoded
    duration = body.get("duration", 0)
    
    if not audio_data:
        raise HTTPException(status_code=400, detail="No audio data provided")
    
    # Decode base64
    try:
        audio_bytes = base64.b64decode(audio_data.split(",")[1] if "," in audio_data else audio_data)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid audio data")
    
    # Save file
    file_id = f"voice_{uuid.uuid4().hex[:16]}.webm"
    file_path = UPLOADS_DIR / file_id
    
    with open(file_path, "wb") as f:
        f.write(audio_bytes)
    
    return {
        "file_id": file_id,
        "file_url": f"/api/files/{file_id}",
        "duration": duration,
        "file_size": len(audio_bytes)
    }

# ==================== MESSAGE REACTIONS ====================

@api_router.post("/messages/{message_id}/reactions")
async def add_reaction(message_id: str, reaction: ReactionCreate, request: Request):
    """Add emoji reaction to a message"""
    current_user = await get_current_user(request)
    
    message = await db.messages.find_one({"message_id": message_id}, {"_id": 0})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Get current reactions
    reactions = message.get("reactions", {})
    emoji = reaction.emoji
    
    # Add user to this emoji's reactions
    if emoji not in reactions:
        reactions[emoji] = []
    
    if current_user["user_id"] not in reactions[emoji]:
        reactions[emoji].append(current_user["user_id"])
    
    await db.messages.update_one(
        {"message_id": message_id},
        {"$set": {"reactions": reactions}}
    )
    
    return {"message": "Reaction added", "reactions": reactions}

@api_router.delete("/messages/{message_id}/reactions/{emoji}")
async def remove_reaction(message_id: str, emoji: str, request: Request):
    """Remove emoji reaction from a message"""
    current_user = await get_current_user(request)
    
    message = await db.messages.find_one({"message_id": message_id}, {"_id": 0})
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    reactions = message.get("reactions", {})
    
    if emoji in reactions and current_user["user_id"] in reactions[emoji]:
        reactions[emoji].remove(current_user["user_id"])
        if not reactions[emoji]:
            del reactions[emoji]
    
    await db.messages.update_one(
        {"message_id": message_id},
        {"$set": {"reactions": reactions}}
    )
    
    return {"message": "Reaction removed", "reactions": reactions}

# ==================== GIPHY INTEGRATION ====================

@api_router.get("/giphy/search")
async def search_giphy(q: str, limit: int = 20, offset: int = 0, request: Request = None):
    """Search for GIFs using Giphy API"""
    if not GIPHY_API_KEY:
        raise HTTPException(status_code=500, detail="Giphy API key not configured")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.giphy.com/v1/gifs/search",
                params={
                    "api_key": GIPHY_API_KEY,
                    "q": q,
                    "limit": min(limit, 50),
                    "offset": offset,
                    "rating": "g",
                    "lang": "en"
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Giphy API error")
            
            data = response.json()
            
            # Transform to simpler format
            gifs = []
            for gif in data.get("data", []):
                gifs.append({
                    "id": gif["id"],
                    "title": gif.get("title", ""),
                    "url": gif["images"]["fixed_height"]["url"],
                    "preview_url": gif["images"]["fixed_height_small"]["url"],
                    "original_url": gif["images"]["original"]["url"],
                    "width": int(gif["images"]["fixed_height"]["width"]),
                    "height": int(gif["images"]["fixed_height"]["height"]),
                })
            
            return {
                "gifs": gifs,
                "total_count": data.get("pagination", {}).get("total_count", 0),
                "offset": offset
            }
            
    except httpx.HTTPError as e:
        logger.error(f"Giphy API error: {e}")
        raise HTTPException(status_code=500, detail="Failed to search GIFs")

@api_router.get("/giphy/trending")
async def trending_giphy(limit: int = 20, offset: int = 0, request: Request = None):
    """Get trending GIFs from Giphy"""
    if not GIPHY_API_KEY:
        raise HTTPException(status_code=500, detail="Giphy API key not configured")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.giphy.com/v1/gifs/trending",
                params={
                    "api_key": GIPHY_API_KEY,
                    "limit": min(limit, 50),
                    "offset": offset,
                    "rating": "g"
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Giphy API error")
            
            data = response.json()
            
            gifs = []
            for gif in data.get("data", []):
                gifs.append({
                    "id": gif["id"],
                    "title": gif.get("title", ""),
                    "url": gif["images"]["fixed_height"]["url"],
                    "preview_url": gif["images"]["fixed_height_small"]["url"],
                    "original_url": gif["images"]["original"]["url"],
                    "width": int(gif["images"]["fixed_height"]["width"]),
                    "height": int(gif["images"]["fixed_height"]["height"]),
                })
            
            return {
                "gifs": gifs,
                "total_count": data.get("pagination", {}).get("total_count", 0),
                "offset": offset
            }
            
    except httpx.HTTPError as e:
        logger.error(f"Giphy API error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get trending GIFs")

# ==================== STICKERS & GIFS ====================

@api_router.get("/stickers")
async def get_stickers():
    """Get available sticker packs"""
    sticker_packs = [
        {
            "pack_id": "emotions",
            "name": "Emotions",
            "stickers": [
                {"id": "happy", "url": "😊", "animated": True},
                {"id": "love", "url": "😍", "animated": True},
                {"id": "sad", "url": "😢", "animated": True},
                {"id": "angry", "url": "😠", "animated": True},
                {"id": "surprised", "url": "😲", "animated": True},
                {"id": "thinking", "url": "🤔", "animated": True},
                {"id": "cool", "url": "😎", "animated": True},
                {"id": "laugh", "url": "😂", "animated": True},
            ]
        },
        {
            "pack_id": "reactions",
            "name": "Reactions",
            "stickers": [
                {"id": "thumbsup", "url": "👍", "animated": True},
                {"id": "thumbsdown", "url": "👎", "animated": True},
                {"id": "clap", "url": "👏", "animated": True},
                {"id": "fire", "url": "🔥", "animated": True},
                {"id": "heart", "url": "❤️", "animated": True},
                {"id": "100", "url": "💯", "animated": True},
                {"id": "party", "url": "🎉", "animated": True},
                {"id": "rocket", "url": "🚀", "animated": True},
            ]
        },
        {
            "pack_id": "animals",
            "name": "Animals",
            "stickers": [
                {"id": "cat", "url": "🐱", "animated": True},
                {"id": "dog", "url": "🐶", "animated": True},
                {"id": "panda", "url": "🐼", "animated": True},
                {"id": "unicorn", "url": "🦄", "animated": True},
                {"id": "butterfly", "url": "🦋", "animated": True},
                {"id": "dolphin", "url": "🐬", "animated": True},
                {"id": "owl", "url": "🦉", "animated": True},
                {"id": "fox", "url": "🦊", "animated": True},
            ]
        }
    ]
    return {"packs": sticker_packs}

@api_router.get("/animated-emojis")
async def get_animated_emojis():
    """Get animated emoji sets"""
    return {"categories": ANIMATED_EMOJIS}

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "MojiChat API is running", "version": "2.0.0"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

@api_router.get("/download/code")
async def download_code():
    """Download source code ZIP file"""
    zip_path = UPLOADS_DIR / "mijichat_code.zip"
    if zip_path.exists():
        return FileResponse(
            path=str(zip_path),
            filename="mijichat_code.zip",
            media_type="application/zip"
        )
    raise HTTPException(status_code=404, detail="File not found")

@api_router.get("/download/full")
async def download_full_code():
    """Download FULL source code ZIP file"""
    zip_path = UPLOADS_DIR / "mijichat_full_code.zip"
    if zip_path.exists():
        return FileResponse(
            path=str(zip_path),
            filename="mijichat_full_code.zip",
            media_type="application/zip"
        )
    raise HTTPException(status_code=404, detail="File not found")

# ==================== MESSAGE SEARCH ====================

@api_router.get("/search/messages")
async def search_messages(q: str, request: Request, conversation_id: Optional[str] = None):
    """Search messages by content"""
    current_user = await get_current_user(request)
    
    if not q.strip():
        return []
    
    # Get user's conversations
    user_convs = await db.conversations.find(
        {"participant_ids": current_user["user_id"]},
        {"conversation_id": 1, "_id": 0}
    ).to_list(100)
    conv_ids = [c["conversation_id"] for c in user_convs]
    
    # Build query
    query = {
        "conversation_id": {"$in": conv_ids},
        "$or": [
            {"content": {"$regex": q, "$options": "i"}},
            {"emoji_content": {"$regex": q, "$options": "i"}}
        ]
    }
    
    if conversation_id:
        query["conversation_id"] = conversation_id
    
    messages = await db.messages.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    
    return messages

@api_router.get("/search/conversations")
async def search_conversations(q: str, request: Request):
    """Search conversations by name or participant"""
    current_user = await get_current_user(request)
    
    if not q.strip():
        return []
    
    # Get user's conversations
    conversations = await db.conversations.find(
        {"participant_ids": current_user["user_id"]},
        {"_id": 0}
    ).to_list(100)
    
    results = []
    for conv in conversations:
        # Get participants
        participants = await db.users.find(
            {"user_id": {"$in": conv["participant_ids"]}},
            {"_id": 0, "password": 0}
        ).to_list(100)
        
        # Check if query matches conversation name or participant names
        conv_name = conv.get("name") or ""
        participant_names = " ".join([p.get("name", "") or "" for p in participants])
        
        if q.lower() in conv_name.lower() or q.lower() in participant_names.lower():
            results.append({
                "conversation_id": conv["conversation_id"],
                "name": conv.get("name"),
                "is_group": conv.get("is_group", False),
                "participants": participants
            })
    
    return results

# ==================== VIDEO CALLS (WebRTC Signaling) ====================

class CallSignal(BaseModel):
    type: str  # offer, answer, ice-candidate
    data: dict
    target_user_id: Optional[str] = None

@api_router.post("/calls/initiate")
async def initiate_call(request: Request):
    """Initiate a video call"""
    current_user = await get_current_user(request)
    body = await request.json()
    
    conversation_id = body.get("conversation_id")
    is_video = body.get("is_video", True)
    
    if not conversation_id:
        raise HTTPException(status_code=400, detail="conversation_id required")
    
    # Verify user is in conversation
    conv = await db.conversations.find_one(
        {"conversation_id": conversation_id, "participant_ids": current_user["user_id"]},
        {"_id": 0}
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    call_id = f"call_{uuid.uuid4().hex[:12]}"
    call_doc = {
        "call_id": call_id,
        "conversation_id": conversation_id,
        "initiator_id": current_user["user_id"],
        "initiator_name": current_user["name"],
        "participants": [current_user["user_id"]],
        "is_video": is_video,
        "status": "ringing",  # ringing, active, ended
        "created_at": datetime.now(timezone.utc).isoformat(),
        "ended_at": None
    }
    
    await db.calls.insert_one(call_doc)
    
    # Create notification for other participants
    for participant_id in conv["participant_ids"]:
        if participant_id != current_user["user_id"]:
            await db.notifications.insert_one({
                "notification_id": f"notif_{uuid.uuid4().hex[:12]}",
                "user_id": participant_id,
                "type": "incoming_call",
                "title": f"{'Video' if is_video else 'Voice'} Call",
                "body": f"{current_user['name']} is calling...",
                "data": {
                    "call_id": call_id,
                    "conversation_id": conversation_id,
                    "caller_name": current_user["name"],
                    "is_video": is_video
                },
                "read": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    return {
        "call_id": call_id,
        "conversation_id": conversation_id,
        "status": "ringing"
    }

@api_router.post("/calls/{call_id}/join")
async def join_call(call_id: str, request: Request):
    """Join an existing call"""
    current_user = await get_current_user(request)
    
    call = await db.calls.find_one({"call_id": call_id}, {"_id": 0})
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    if call["status"] == "ended":
        raise HTTPException(status_code=400, detail="Call has ended")
    
    # Add user to participants
    await db.calls.update_one(
        {"call_id": call_id},
        {
            "$addToSet": {"participants": current_user["user_id"]},
            "$set": {"status": "active"}
        }
    )
    
    return {"call_id": call_id, "status": "joined"}

@api_router.post("/calls/{call_id}/signal")
async def send_signal(call_id: str, signal: CallSignal, request: Request):
    """Send WebRTC signaling data"""
    current_user = await get_current_user(request)
    
    call = await db.calls.find_one({"call_id": call_id}, {"_id": 0})
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    # Store signal for target user(s)
    signal_doc = {
        "signal_id": f"sig_{uuid.uuid4().hex[:12]}",
        "call_id": call_id,
        "from_user_id": current_user["user_id"],
        "target_user_id": signal.target_user_id,
        "type": signal.type,
        "data": signal.data,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "processed": False
    }
    
    await db.call_signals.insert_one(signal_doc)
    
    return {"status": "sent"}

@api_router.get("/calls/{call_id}/signals")
async def get_signals(call_id: str, request: Request):
    """Get pending WebRTC signals for current user"""
    current_user = await get_current_user(request)
    
    # Get unprocessed signals for this user
    signals = await db.call_signals.find(
        {
            "call_id": call_id,
            "$or": [
                {"target_user_id": current_user["user_id"]},
                {"target_user_id": None, "from_user_id": {"$ne": current_user["user_id"]}}
            ],
            "processed": False
        },
        {"_id": 0}
    ).to_list(50)
    
    # Mark as processed
    signal_ids = [s["signal_id"] for s in signals]
    if signal_ids:
        await db.call_signals.update_many(
            {"signal_id": {"$in": signal_ids}},
            {"$set": {"processed": True}}
        )
    
    return signals

@api_router.post("/calls/{call_id}/end")
async def end_call(call_id: str, request: Request):
    """End a call"""
    current_user = await get_current_user(request)
    
    await db.calls.update_one(
        {"call_id": call_id},
        {"$set": {
            "status": "ended",
            "ended_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # Clean up signals
    await db.call_signals.delete_many({"call_id": call_id})
    
    return {"status": "ended"}

@api_router.get("/calls/active")
async def get_active_calls(request: Request):
    """Get active calls for current user"""
    current_user = await get_current_user(request)
    
    # Get user's conversations
    user_convs = await db.conversations.find(
        {"participant_ids": current_user["user_id"]},
        {"conversation_id": 1, "_id": 0}
    ).to_list(100)
    conv_ids = [c["conversation_id"] for c in user_convs]
    
    # Find active/ringing calls
    calls = await db.calls.find(
        {
            "conversation_id": {"$in": conv_ids},
            "status": {"$in": ["ringing", "active"]}
        },
        {"_id": 0}
    ).to_list(10)
    
    return calls

# ==================== PUSH NOTIFICATIONS ====================

class PushSubscription(BaseModel):
    endpoint: str
    keys: dict

@api_router.post("/notifications/subscribe")
async def subscribe_push(subscription: PushSubscription, request: Request):
    """Subscribe to push notifications"""
    current_user = await get_current_user(request)
    
    # Store subscription
    await db.push_subscriptions.update_one(
        {"user_id": current_user["user_id"], "endpoint": subscription.endpoint},
        {"$set": {
            "user_id": current_user["user_id"],
            "endpoint": subscription.endpoint,
            "keys": subscription.keys,
            "created_at": datetime.now(timezone.utc).isoformat()
        }},
        upsert=True
    )
    
    return {"status": "subscribed"}

@api_router.delete("/notifications/unsubscribe")
async def unsubscribe_push(request: Request):
    """Unsubscribe from push notifications"""
    current_user = await get_current_user(request)
    
    try:
        body = await request.json()
        endpoint = body.get("endpoint")
    except:
        endpoint = None
    
    if endpoint:
        await db.push_subscriptions.delete_one({
            "user_id": current_user["user_id"],
            "endpoint": endpoint
        })
    else:
        # Delete all subscriptions for user
        await db.push_subscriptions.delete_many({
            "user_id": current_user["user_id"]
        })
    
    return {"status": "unsubscribed"}

@api_router.get("/notifications")
async def get_notifications(request: Request, limit: int = 20):
    """Get user notifications"""
    current_user = await get_current_user(request)
    
    notifications = await db.notifications.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    return notifications

@api_router.post("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, request: Request):
    """Mark notification as read"""
    current_user = await get_current_user(request)
    
    await db.notifications.update_one(
        {"notification_id": notification_id, "user_id": current_user["user_id"]},
        {"$set": {"read": True}}
    )
    
    return {"status": "read"}

@api_router.get("/notifications/unread-count")
async def get_unread_count(request: Request):
    """Get unread notification count"""
    current_user = await get_current_user(request)
    
    count = await db.notifications.count_documents({
        "user_id": current_user["user_id"],
        "read": False
    })
    
    return {"count": count}

class SendPushRequest(BaseModel):
    expo_token: str
    title: str = "Test Notification"
    body: str = "This is a test push notification from MijiChat!"
    data: Optional[dict] = None

@api_router.post("/notifications/send-push")
async def send_push_notification(push_data: SendPushRequest, request: Request):
    """Send push notification via Expo Push API"""
    current_user = await get_current_user(request)
    
    # Expo Push API endpoint
    EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
    
    # Prepare the message
    message = {
        "to": push_data.expo_token,
        "title": push_data.title,
        "body": push_data.body,
        "sound": "default",
        "priority": "high",
        "channelId": "default",
    }
    
    if push_data.data:
        message["data"] = push_data.data
    
    logger.info(f"Sending push notification to: {push_data.expo_token[:30]}...")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=message,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                }
            )
            
            result = response.json()
            logger.info(f"Expo Push API response: {result}")
            
            if response.status_code == 200:
                # Check for errors in the response
                if "data" in result:
                    ticket = result["data"]
                    if ticket.get("status") == "ok":
                        return {
                            "success": True,
                            "message": "Push notification sent successfully!",
                            "ticket_id": ticket.get("id"),
                            "details": ticket
                        }
                    else:
                        return {
                            "success": False,
                            "message": f"Push failed: {ticket.get('message', 'Unknown error')}",
                            "details": ticket
                        }
                return {
                    "success": True,
                    "message": "Request sent",
                    "details": result
                }
            else:
                return {
                    "success": False,
                    "message": f"HTTP {response.status_code}",
                    "details": result
                }
                
    except Exception as e:
        logger.error(f"Push notification error: {e}")
        return {
            "success": False,
            "message": str(e)
        }

@api_router.post("/notifications/send-to-user/{user_id}")
async def send_push_to_user(user_id: str, request: Request):
    """Send push notification to a specific user (for testing)"""
    current_user = await get_current_user(request)
    body = await request.json()
    
    # Get user's push token
    subscription = await db.push_subscriptions.find_one(
        {"user_id": user_id},
        {"_id": 0}
    )
    
    if not subscription:
        raise HTTPException(status_code=404, detail="User has no push subscription")
    
    expo_token = subscription.get("endpoint")
    if not expo_token or not expo_token.startswith("ExponentPushToken"):
        raise HTTPException(status_code=400, detail="Invalid push token")
    
    # Send via Expo
    push_request = SendPushRequest(
        expo_token=expo_token,
        title=body.get("title", "New Message"),
        body=body.get("body", "You have a new message!"),
        data=body.get("data")
    )
    
    return await send_push_notification(push_request, request)

# ==================== WEBSOCKET ENDPOINT ====================

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    """WebSocket endpoint for real-time communication"""
    # Verify user token from query params
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001)
        return
    
    # Verify JWT token
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        token_user_id = payload.get("user_id")
        if token_user_id != user_id:
            await websocket.close(code=4003)
            return
    except jwt.ExpiredSignatureError:
        await websocket.close(code=4002)
        return
    except jwt.InvalidTokenError:
        await websocket.close(code=4003)
        return
    
    # Connect the user
    await ws_manager.connect(websocket, user_id)
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            message_type = data.get("type")
            
            if message_type == "typing":
                # Handle typing indicator
                conversation_id = data.get("conversation_id")
                is_typing = data.get("is_typing", False)
                user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "name": 1})
                user_name = user.get("name", "User") if user else "User"
                
                await ws_manager.send_typing_indicator(
                    conversation_id, user_id, user_name, is_typing
                )
                
            elif message_type == "message_read":
                # Handle read receipt
                conversation_id = data.get("conversation_id")
                message_id = data.get("message_id")
                
                # Update message in DB
                await db.messages.update_one(
                    {"message_id": message_id},
                    {"$addToSet": {"read_by": user_id}}
                )
                
                # Broadcast read receipt
                await ws_manager.send_message_read(conversation_id, message_id, user_id)
                
            elif message_type == "ping":
                # Handle heartbeat/ping
                await websocket.send_json({"type": "pong", "timestamp": datetime.now(timezone.utc).isoformat()})
                
                # Update user's online status
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$set": {"is_online": True, "last_seen": datetime.now(timezone.utc).isoformat()}}
                )
                
            elif message_type == "subscribe_conversation":
                # Subscribe to a conversation's updates
                conversation_id = data.get("conversation_id")
                if conversation_id not in ws_manager.conversation_subscribers:
                    ws_manager.conversation_subscribers[conversation_id] = set()
                ws_manager.conversation_subscribers[conversation_id].add(user_id)
                
            elif message_type == "unsubscribe_conversation":
                # Unsubscribe from a conversation
                conversation_id = data.get("conversation_id")
                if conversation_id in ws_manager.conversation_subscribers:
                    ws_manager.conversation_subscribers[conversation_id].discard(user_id)
                    
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket, user_id)
    except Exception as e:
        logger.error(f"WebSocket error for {user_id}: {e}")
        await ws_manager.disconnect(websocket, user_id)

# Include router and configure app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount uploads directory for static file serving
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
