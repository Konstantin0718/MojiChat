from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from fastapi.security import HTTPBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import httpx

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

class MessageResponse(BaseModel):
    message_id: str
    conversation_id: str
    sender_id: str
    sender_name: str
    content: str
    emoji_content: str
    created_at: datetime
    read_by: List[str] = []

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
        "created_at": datetime.now(timezone.utc).isoformat()
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
            "created_at": datetime.now(timezone.utc).isoformat()
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
        "last_seen": user.get("last_seen")
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
    
    # Convert text to emoji
    emoji_content = await convert_text_to_emoji(msg_data.content)
    
    message_id = f"msg_{uuid.uuid4().hex[:12]}"
    msg_doc = {
        "message_id": message_id,
        "conversation_id": conversation_id,
        "sender_id": current_user["user_id"],
        "sender_name": current_user["name"],
        "content": msg_data.content,
        "emoji_content": emoji_content,
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
