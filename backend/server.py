from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Form
from fastapi.security import HTTPBearer
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
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

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'default_secret')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7

# Create the main app
app = FastAPI(title="MojiChat API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# Create uploads directory
UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

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
        "country_code": None
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
    translations = {}
    
    if msg_data.message_type == "text" and msg_data.content:
        emoji_content = await convert_text_to_emoji(msg_data.content)
        
        # Get all participants and their languages
        participants = await db.users.find(
            {"user_id": {"$in": conv["participant_ids"]}},
            {"_id": 0, "user_id": 1, "preferred_language": 1}
        ).to_list(100)
        
        sender_lang = current_user.get("preferred_language", "en")
        
        # Pre-translate for each unique language (except sender's)
        unique_langs = set()
        for p in participants:
            lang = p.get("preferred_language", "en")
            if lang != sender_lang:
                unique_langs.add(lang)
        
        for target_lang in unique_langs:
            translated = await translate_text(msg_data.content, target_lang, sender_lang)
            translations[target_lang] = translated
    
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
    
    return {
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
            system_message=f"""You are a translator. Translate the given text to {lang_name}.
Rules:
1. Return ONLY the translated text, nothing else
2. Preserve the tone and emotion of the original
3. If text is already in {lang_name}, return it as-is
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
    """Translate text to target language"""
    current_user = await get_current_user(request)
    body = await request.json()
    
    text = body.get("text", "")
    target_language = body.get("target_language", current_user.get("preferred_language", "en"))
    
    translated = await translate_text(text, target_language)
    return {"original": text, "translated": translated, "language": target_language}

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
    return {"message": "MojiChat API is running", "version": "1.0.0"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

# Include router and configure app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
