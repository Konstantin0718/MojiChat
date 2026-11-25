from fastapi import FastAPI, APIRouter, BackgroundTasks, HTTPException, Depends, Request, Response, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import json
import asyncio
import time
from contextlib import asynccontextmanager
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import List, Optional, Dict
import uuid
import hashlib
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse
import bcrypt
import jwt
from bson import ObjectId
from bson.errors import InvalidId
import httpx
import base64
import mimetypes
import re
import smtplib
from email.message import EmailMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ.get('MONGO_URL') or os.environ.get('MONGODB_URI')
if not mongo_url:
    raise RuntimeError("MONGO_URL or MONGODB_URI environment variable is required")
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'mojichat_db')]

from file_storage import (  # noqa: E402
    build_file_store,
    content_disposition,
    detect_upload,
    file_url_window,
    max_bytes_for,
    parse_byte_range,
    parse_file_id,
    present_file_url,
    sanitize_filename,
    upload_byte_ceiling,
    upload_daily_bytes,
    verify_file_signature,
)
file_store = build_file_store(db)

def _require_jwt_secret() -> str:
    """Refuse to boot with a missing or guessable signing key."""
    secret = (os.environ.get("JWT_SECRET") or "").strip()
    if not secret or secret == "default_secret" or len(secret) < 32:
        raise RuntimeError(
            "JWT_SECRET must be set to a unique value of at least 32 characters"
        )
    return secret


JWT_SECRET = _require_jwt_secret()
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7

@asynccontextmanager
async def lifespan(_app: FastAPI):
    await create_db_indexes()
    yield
    client.close()


app = FastAPI(title="MojiChat API", lifespan=lifespan)

# ==================== CORS ====================
# Auth is Bearer-only, so credentials stay off and a wildcard origin is never used.
_DEFAULT_WEB_ORIGIN = "https://moji-chat-gamma.vercel.app"
_DEV_WEB_ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000")


def configured_cors_origins() -> List[str]:
    raw = (os.environ.get("CORS_ORIGINS") or "").strip()
    origins = []
    for item in raw.split(",") if raw else []:
        origin = item.strip().rstrip("/")
        if origin and origin != "*":
            origins.append(origin)
    if not origins:
        origins = [_DEFAULT_WEB_ORIGIN]
    dev_flag = (os.environ.get("CORS_ALLOW_DEV_ORIGINS") or "").strip().lower()
    if dev_flag in ("1", "true", "yes"):
        for origin in _DEV_WEB_ORIGINS:
            if origin not in origins:
                origins.append(origin)
    return origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_cors_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== SECURITY HEADERS ====================
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    # Keep CSP unset to avoid breaking existing frontends.
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "microphone=(), camera=(), geolocation=()")
    return response

api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# Giphy API Key
GIPHY_API_KEY = os.environ.get('GIPHY_API_KEY', '')

# ==================== FIREBASE ADMIN SDK ====================
import firebase_admin
from firebase_admin import credentials, messaging as fcm_messaging

firebase_app = None
try:
    firebase_json = os.environ.get('FIREBASE_SERVICE_ACCOUNT_JSON')
    if firebase_json:
        import json as json_module
        cred_dict = json_module.loads(firebase_json)
        cred = credentials.Certificate(cred_dict)
        firebase_app = firebase_admin.initialize_app(cred)
        logging.info("Firebase Admin SDK initialized from env var")
    else:
        logging.warning("FIREBASE_SERVICE_ACCOUNT_JSON not set, FCM push disabled")
except Exception as e:
    logging.error(f"Firebase Admin SDK init error: {e}")
    firebase_app = None

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
        conv = await db.conversations.find_one(
            {"conversation_id": conversation_id},
            {"_id": 0, "participant_ids": 1},
        )
        if not conv:
            return
        timestamp = datetime.now(timezone.utc).isoformat()
        for user_id in conv["participant_ids"]:
            if user_id == sender_id:
                continue
            await self.send_to_user(user_id, {
                "type": "new_message",
                "conversation_id": conversation_id,
                "message": present_message(message_data, user_id),
                "timestamp": timestamp,
            })
    
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

    async def send_block_update(self, blocker_id: str, blocked_id: str, blocked: bool):
        """Tell both people's open sessions that a block changed."""
        message = {
            "type": "block:update",
            "blocker_id": blocker_id,
            "blocked_id": blocked_id,
            "blocked": blocked,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self.send_to_user(blocked_id, message)
        if blocker_id != blocked_id:
            await self.send_to_user(blocker_id, message)

# Global WebSocket manager
ws_manager = ConnectionManager()

# ==================== SIMPLE RATE LIMITING ====================
# In-memory limiter (good enough for a single backend instance on Render).
# If you later scale horizontally, consider Redis-based rate limiting.
_rate_lock = asyncio.Lock()
_rate_state: Dict[str, List[float]] = {}
_rate_windows: Dict[str, int] = {}
_last_rate_purge = 0.0
_RATE_PURGE_SECONDS = 60
USER_SEARCH_LIMIT = 30
USER_SEARCH_WINDOW = 60
USER_SEARCH_MIN_CHARS = 2


def _get_client_ip(request: Request) -> Optional[str]:
    # Behind Cloudflare the last X-Forwarded-For hop is a Cloudflare edge address
    # and the first hop can be spoofed by the client. Only Cloudflare's own
    # headers are trusted. X-Forwarded-For is ignored.
    for header in ("true-client-ip", "cf-connecting-ip"):
        value = (request.headers.get(header) or "").strip()
        if value:
            return value
    return None


def _rate_limit_ip(request: Request) -> str:
    """IP for limits that must always have a key. Falls back when Cloudflare is absent."""
    trusted = _get_client_ip(request)
    if trusted:
        return trusted
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def purge_rate_state(now: Optional[float] = None) -> int:
    """Drop buckets whose hits are all outside the window they were recorded with."""
    global _last_rate_purge
    current = time.time() if now is None else now
    removed = 0
    for key, timestamps in list(_rate_state.items()):
        window = _rate_windows.get(key) or 86400
        fresh = [stamp for stamp in timestamps if current - stamp < window]
        if fresh:
            _rate_state[key] = fresh
            continue
        _rate_state.pop(key, None)
        _rate_windows.pop(key, None)
        removed += 1
    _last_rate_purge = current
    return removed


def _maybe_purge_rate_state(now: float) -> None:
    if now - _last_rate_purge < _RATE_PURGE_SECONDS:
        return
    purge_rate_state(now)


async def enforce_named_rate_limits(checks):
    """Apply every bucket, and record the hit only when all of them still have room."""
    now = time.time()
    async with _rate_lock:
        _maybe_purge_rate_state(now)
        prepared = []
        for key, limit, window_seconds in checks:
            timestamps = [t for t in _rate_state.get(key, []) if now - t < window_seconds]
            if len(timestamps) >= limit:
                oldest = min(timestamps) if timestamps else now
                retry_after = max(1, int(window_seconds - (now - oldest)))
                raise HTTPException(
                    status_code=429,
                    detail="Too many requests. Please try again later.",
                    headers={"Retry-After": str(retry_after)},
                )
            prepared.append((key, timestamps, window_seconds))
        for key, timestamps, window_seconds in prepared:
            timestamps.append(now)
            _rate_state[key] = timestamps
            _rate_windows[key] = max(_rate_windows.get(key, 0), window_seconds)


async def enforce_named_rate_limit(key: str, limit: int, window_seconds: int):
    await enforce_named_rate_limits([(key, limit, window_seconds)])


async def enforce_rate_limit(request: Request, bucket: str, limit: int, window_seconds: int):
    await enforce_named_rate_limit(
        f"{bucket}:{_rate_limit_ip(request)}",
        limit,
        window_seconds,
    )


def _positive_int_env(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def llm_max_input_chars() -> int:
    return _positive_int_env("LLM_MAX_INPUT_CHARS", 2000)


def llm_rate_per_minute() -> int:
    return _positive_int_env("LLM_RATE_PER_MINUTE", 30)


def llm_rate_per_day() -> int:
    return _positive_int_env("LLM_RATE_PER_DAY", 300)


def llm_ip_rate_per_minute() -> int:
    return _positive_int_env("LLM_IP_RATE_PER_MINUTE", 60)


async def enforce_llm_limits(request: Request, user: dict, text: str):
    """Auth is already done. Reject oversized text, then count user and IP usage."""
    if not isinstance(text, str):
        raise HTTPException(status_code=422, detail="text must be a string")
    if len(text) > llm_max_input_chars():
        raise HTTPException(status_code=413, detail="Text is too long")
    user_id = user["user_id"]
    await enforce_named_rate_limits([
        (f"llm:user:{user_id}:minute", llm_rate_per_minute(), 60),
        (f"llm:user:{user_id}:day", llm_rate_per_day(), 86400),
        (f"llm:ip:{_rate_limit_ip(request)}:minute", llm_ip_rate_per_minute(), 60),
    ])


async def llm_allowed(request: Request, user: dict, text: str) -> bool:
    try:
        await enforce_llm_limits(request, user, text)
        return True
    except HTTPException as exc:
        if exc.status_code in (413, 429):
            return False
        raise

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
    content: Optional[str] = Field(None, max_length=10000)
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

    @field_validator("emoji")
    @classmethod
    def emoji_key(cls, value: str) -> str:
        text = (value or "").strip()
        if not text or len(text) > 32:
            raise ValueError("invalid emoji")
        if text.startswith("$") or any(ch in text for ch in ".$\\\x00"):
            raise ValueError("invalid emoji")
        if all(ch.isascii() and (ch.isalnum() or ch in " _") for ch in text):
            raise ValueError("invalid emoji")
        return text

class UserLanguageUpdate(BaseModel):
    preferred_language: str
    country_code: Optional[str] = None

class TypingStatus(BaseModel):
    is_typing: bool

class ForwardMessageBody(BaseModel):
    conversation_ids: List[str] = Field(min_length=1, max_length=20)

    @field_validator("conversation_ids")
    @classmethod
    def plain_ids(cls, values: List[str]) -> List[str]:
        for item in values:
            if not item.strip() or len(item) > 80 or item.startswith("$") or "." in item:
                raise ValueError("invalid conversation id")
        return values

class AddMemberBody(BaseModel):
    user_id: str = Field(min_length=1, max_length=80)

    @field_validator("user_id")
    @classmethod
    def plain_user_id(cls, value: str) -> str:
        if value.startswith("$") or "." in value:
            raise ValueError("invalid user id")
        return value

class CallInitiateBody(BaseModel):
    conversation_id: str = Field(min_length=1, max_length=80)
    is_video: bool = True

    @field_validator("conversation_id")
    @classmethod
    def plain_conversation_id(cls, value: str) -> str:
        if value.startswith("$") or "." in value:
            raise ValueError("invalid conversation id")
        return value

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

def normalize_email(value) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip().lower()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def token_version_of(value) -> int:
    """Missing or unreadable versions are 0 so older JWTs still match backfilled users."""
    if value is None or isinstance(value, bool):
        return 0
    try:
        number = int(value)
    except (TypeError, ValueError):
        return 0
    return number if number >= 0 else 0


def create_token(user_id: str, token_version: int = 0) -> str:
    payload = {
        "user_id": user_id,
        "token_version": token_version_of(token_version),
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRATION_DAYS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _bearer_token(request: Request) -> str:
    auth_header = request.headers.get("Authorization") or ""
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return token


async def get_current_user(request: Request) -> dict:
    session_token = _bearer_token(request)
    
    try:
        payload = jwt.decode(session_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        if user_id:
            user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
            if not user:
                raise HTTPException(status_code=401, detail="Not authenticated")
            if token_version_of(payload.get("token_version")) != token_version_of(user.get("token_version")):
                raise HTTPException(status_code=401, detail="Token revoked")
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": {"is_online": True, "last_seen": datetime.now(timezone.utc).isoformat()}}
            )
            return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        pass
    
    # Opaque session rows from older Google logins, sent as Bearer tokens.
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


async def get_conversation_for_user(conversation_id: str, user: dict) -> dict:
    """Return the conversation when user is a participant. Otherwise 404, never 403."""
    if not isinstance(conversation_id, str) or not conversation_id.strip():
        raise HTTPException(status_code=404, detail="Not found")
    conversation = await db.conversations.find_one(
        {
            "conversation_id": conversation_id,
            "participant_ids": user["user_id"],
        },
        {"_id": 0},
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Not found")
    return conversation


async def get_message_for_user(message_id: str, user: dict) -> dict:
    if not isinstance(message_id, str) or not message_id.strip():
        raise HTTPException(status_code=404, detail="Not found")
    message = await db.messages.find_one({"message_id": message_id}, {"_id": 0})
    if not message:
        raise HTTPException(status_code=404, detail="Not found")
    await get_conversation_for_user(message.get("conversation_id") or "", user)
    return message


async def get_call_for_user(call_id: str, user: dict) -> dict:
    if not isinstance(call_id, str) or not call_id.strip():
        raise HTTPException(status_code=404, detail="Not found")
    call = await db.calls.find_one({"call_id": call_id}, {"_id": 0})
    if not call:
        raise HTTPException(status_code=404, detail="Not found")
    await get_conversation_for_user(call.get("conversation_id") or "", user)
    return call

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
        
    except Exception as exc:
        logger.error("AI emoji conversion error: %s", type(exc).__name__)
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
async def register(user_data: UserCreate):
    email = normalize_email(str(user_data.email))
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    hashed_pwd = hash_password(user_data.password)
    
    user_doc = {
        "user_id": user_id,
        "email": email,
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
        "phone_verified": False,
        "token_version": 0,
    }
    
    await db.users.insert_one(user_doc)
    
    token = create_token(user_id, 0)
    
    return {
        "user_id": user_id,
        "email": email,
        "name": user_data.name,
        "picture": None,
        "token": token
    }

@api_router.post("/auth/login")
async def login(request: Request, user_data: UserLogin):
    # Rate limit to reduce brute-force attempts.
    await enforce_rate_limit(request, bucket="auth_login", limit=10, window_seconds=600)
    email = normalize_email(str(user_data.email))
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user.get("password"):
        raise HTTPException(status_code=401, detail="Please use Google login for this account")
    
    if not verify_password(user_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["user_id"], token_version_of(user.get("token_version")))
    
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"is_online": True, "last_seen": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user["name"],
        "picture": present_file_url(user.get("picture"), user["user_id"]),
        "token": token
    }

@api_router.post("/auth/session")
async def process_google_session(request: Request):
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
    
    email = normalize_email(data.get("email") or "")
    name = data.get("name")
    picture = data.get("picture")
    emergent_session_token = data.get("session_token")
    if not email:
        raise HTTPException(status_code=401, detail="Invalid session")
    
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
            "country_code": None,
            "token_version": 0,
        }
        await db.users.insert_one(user_doc)
    
    # Store session. The client sends this opaque token as a Bearer header.
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": emergent_session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "user_id": user_id,
        "email": email,
        "name": name,
        "picture": present_file_url(picture, user_id),
        "token": emergent_session_token
    }

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return own_profile(user)

@api_router.post("/auth/logout")
async def logout(request: Request):
    try:
        user = await get_current_user(request)
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {"$set": {"is_online": False, "last_seen": datetime.now(timezone.utc).isoformat()}}
        )
        await db.user_sessions.delete_many({"user_id": user["user_id"]})
        # This device only. Other devices stay until logout-all.
        await delete_push_endpoints(user["user_id"], await push_endpoints_from_request(request))
    except Exception:
        pass
    return {"message": "Logged out"}


@api_router.post("/auth/logout-all")
async def logout_all(request: Request):
    """Invalidate every JWT and opaque session for the signed-in user."""
    user = await get_current_user(request)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$inc": {"token_version": 1}},
    )
    await db.user_sessions.delete_many({"user_id": user["user_id"]})
    await db.push_subscriptions.delete_many({"user_id": user["user_id"]})
    return {"message": "All sessions revoked"}

# ==================== PASSWORD RESET ====================

RESET_EMAIL_MESSAGE = "If this email exists, a reset link has been sent"
RESET_TOKEN_MINUTES = 60
_FORGOT_WINDOW_SECONDS = 3600
_FORGOT_EMAIL_LIMIT = 3
_FORGOT_IP_LIMIT = 10
_forgot_hits: Dict[str, List[float]] = {}
BREVO_EMAIL_URL = "https://api.brevo.com/v3/smtp/email"


def _reset_log():
    # uvicorn configures logging before this module's basicConfig runs.
    return logging.getLogger("uvicorn.error")


def _resolved_email_from() -> str:
    return (os.environ.get("EMAIL_FROM") or os.environ.get("SMTP_FROM") or "").strip()


def _resolved_email_from_name() -> str:
    return (os.environ.get("EMAIL_FROM_NAME") or "MojiChat").strip() or "MojiChat"


def _brevo_api_key() -> str:
    return (os.environ.get("BREVO_API_KEY") or "").strip()


def _warn_email_from_missing() -> None:
    if _brevo_api_key() and not _resolved_email_from():
        _reset_log().warning("BREVO_API_KEY is set but EMAIL_FROM is empty")


def hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _new_reset_token() -> str:
    return uuid.uuid4().hex


def _smtp_configured() -> bool:
    return bool(
        os.environ.get("SMTP_HOST")
        and _resolved_email_from()
        and os.environ.get("FRONTEND_URL")
    )


def _record_forgot_attempt(key: str, limit: int, now: float) -> bool:
    """Return True when this attempt is over the limit. The attempt is counted."""
    stamps = [t for t in _forgot_hits.get(key, []) if now - t < _FORGOT_WINDOW_SECONDS]
    over = len(stamps) >= limit
    if not over:
        stamps.append(now)
    if stamps:
        _forgot_hits[key] = stamps
    else:
        _forgot_hits.pop(key, None)
    return over


def _purge_forgot_hits(now: float) -> None:
    if len(_forgot_hits) <= 10000:
        return
    cutoff = now - _FORGOT_WINDOW_SECONDS
    stale = [
        key for key, stamps in _forgot_hits.items()
        if not stamps or stamps[-1] < cutoff
    ]
    for key in stale:
        _forgot_hits.pop(key, None)


async def forgot_password_limited(email: str, ip: Optional[str]) -> bool:
    now = time.time()
    async with _rate_lock:
        _purge_forgot_hits(now)
        email_over = _record_forgot_attempt(f"forgot-email:{email.lower()}", _FORGOT_EMAIL_LIMIT, now)
        ip_over = bool(ip) and _record_forgot_attempt(f"forgot-ip:{ip}", _FORGOT_IP_LIMIT, now)
    return email_over or ip_over


def _reset_link(reset_token: str) -> str:
    frontend = os.environ.get("FRONTEND_URL", "").rstrip("/")
    return f"{frontend}/forgot-password?token={reset_token}"


def _reset_bodies(reset_token: str) -> tuple:
    link = _reset_link(reset_token)
    text = (
        "Choose a new MojiChat password with this link. It expires in one hour.\n\n"
        f"{link}\n\n"
        "If you did not ask for this, you can ignore the email.\n"
    )
    html = (
        "<p>Choose a new MojiChat password with this link. It expires in one hour.</p>"
        f'<p><a href="{link}">Reset password</a></p>'
        "<p>If you did not ask for this, you can ignore the email.</p>"
    )
    return text, html


async def _send_via_brevo(to_email: str, reset_token: str) -> None:
    """Brevo only. A failed call does not fall back to SMTP. Never log the body or key."""
    log = _reset_log()
    sender = _resolved_email_from()
    frontend = (os.environ.get("FRONTEND_URL") or "").strip()
    if not sender or not frontend:
        log.info("Password reset email is not configured")
        return
    text, html = _reset_bodies(reset_token)
    payload = {
        "sender": {"email": sender, "name": _resolved_email_from_name()},
        "to": [{"email": to_email}],
        "subject": "Reset your MojiChat password",
        "htmlContent": html,
        "textContent": text,
    }
    for attempt in (1, 2):
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.post(
                    BREVO_EMAIL_URL,
                    headers={
                        "api-key": _brevo_api_key(),
                        "accept": "application/json",
                        "content-type": "application/json",
                    },
                    json=payload,
                )
        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            log.error("brevo status=error %s", type(exc).__name__)
            if attempt == 1:
                await asyncio.sleep(1.5)
                continue
            return
        except Exception as exc:
            log.error("brevo status=error %s", type(exc).__name__)
            return
        if 200 <= response.status_code < 300:
            log.info("Password reset email sent")
            return
        log.error("brevo status=%s", response.status_code)
        return


def _send_via_smtp(to_email: str, reset_token: str) -> None:
    log = _reset_log()
    text, _html = _reset_bodies(reset_token)
    message = EmailMessage()
    message["Subject"] = "Reset your MojiChat password"
    message["From"] = _resolved_email_from()
    message["To"] = to_email
    message.set_content(text)
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    username = os.environ.get("SMTP_USERNAME") or ""
    password = os.environ.get("SMTP_PASSWORD") or ""
    use_tls = os.environ.get("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=10) as smtp:
                if username:
                    smtp.login(username, password)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=10) as smtp:
                if use_tls:
                    smtp.starttls()
                if username:
                    smtp.login(username, password)
                smtp.send_message(message)
        log.info("Password reset email sent")
    except Exception:
        log.error("Password reset email failed")


async def deliver_reset_email(to_email: str, reset_token: str) -> None:
    """Pick Brevo or SMTP from config. Never switch provider after an error."""
    if _brevo_api_key():
        await _send_via_brevo(to_email, reset_token)
        return
    if _smtp_configured():
        await asyncio.to_thread(_send_via_smtp, to_email, reset_token)
        return
    _reset_log().info("Password reset email is not configured")


@api_router.post("/auth/forgot-password")
async def forgot_password(request: Request, data: PasswordResetRequest, background_tasks: BackgroundTasks):
    """Send password reset email. The response does not reveal whether the account exists."""
    generic = {"message": RESET_EMAIL_MESSAGE}
    email = normalize_email(str(data.email))
    if await forgot_password_limited(email, _get_client_ip(request)):
        return generic

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        return generic

    reset_token = _new_reset_token()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_MINUTES)
    token_hash = hash_reset_token(reset_token)
    await db.password_resets.delete_many({"user_id": user["user_id"]})
    await db.password_resets.delete_many({"email": email})
    await db.password_resets.insert_one({
        "email": email,
        "user_id": user["user_id"],
        "token": token_hash,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    background_tasks.add_task(deliver_reset_email, email, reset_token)

    if os.environ.get("EXPOSE_RESET_TOKEN", "").lower() in ("1", "true", "yes"):
        return {"message": RESET_EMAIL_MESSAGE, "reset_token": reset_token}
    return generic

@api_router.post("/auth/reset-password")
async def reset_password(data: PasswordResetConfirm):
    """Reset password using a single-use token."""
    token_hash = hash_reset_token(data.token)
    reset_request = await db.password_resets.find_one_and_delete(
        {"token": token_hash},
        projection={"_id": 0},
    )
    if not reset_request:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    expires_at = datetime.fromisoformat(reset_request["expires_at"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    hashed_pwd = hash_password(data.new_password)
    await db.users.update_one(
        {"email": reset_request["email"]},
        {"$set": {"password": hashed_pwd}, "$inc": {"token_version": 1}},
    )
    if reset_request.get("user_id"):
        await db.user_sessions.delete_many({"user_id": reset_request["user_id"]})
    return {"message": "Password has been reset successfully"}

# ==================== EMAIL VERIFICATION ====================

@api_router.post("/auth/send-verification")
async def send_verification_email(request: Request):
    """Send a verification token for the signed-in user. The response does not reveal account state."""
    user = await get_current_user(request)
    email = normalize_email(user.get("email") or "")
    if email and not user.get("email_verified"):
        verification_token = uuid.uuid4().hex
        expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        await db.email_verifications.delete_many({"email": email})
        await db.email_verifications.insert_one({
            "email": email,
            "token": verification_token,
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    
    return {"message": "Verification email sent"}

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

def _phone_auth_enabled() -> bool:
    return (os.environ.get("PHONE_AUTH_ENABLED") or "").strip().lower() in ("1", "true", "yes")


def _require_phone_auth():
    if not _phone_auth_enabled():
        raise HTTPException(status_code=404, detail="Not found")


@api_router.post("/auth/phone/send-code")
async def send_phone_verification_code(data: PhoneVerificationRequest):
    """Send verification code to phone number. Disabled unless PHONE_AUTH_ENABLED is set."""
    _require_phone_auth()
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
    
    return {
        "message": "Verification code sent",
        "phone_number": phone,
    }

@api_router.post("/auth/phone/verify")
async def verify_phone_and_register(data: PhoneVerificationConfirm):
    """Verify phone code and register/login user"""
    _require_phone_auth()
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
            "phone_verified": True,
            "token_version": 0,
        }
        await db.users.insert_one(user_doc)
    
    version = 0
    if existing_user:
        version = token_version_of(existing_user.get("token_version"))
    token = create_token(user_id, version)
    
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
    
    return {
        "user_id": user_id,
        "phone_number": phone,
        "name": user.get("name"),
        "email": user.get("email"),
        "picture": present_file_url(user.get("picture"), user_id),
        "token": token,
        "is_new_user": not existing_user
    }

# ==================== USER ENDPOINTS ====================

def present_message(message: Optional[dict], viewer_id: Optional[str]):
    if not message:
        return message
    shown = dict(message)
    shown.pop("_id", None)
    if shown.get("file_url"):
        shown["file_url"] = present_file_url(shown.get("file_url"), viewer_id)
    return shown


def public_user(user: dict, viewer_id: Optional[str] = None) -> dict:
    """Fields safe to show to someone else."""
    picture = user.get("picture") or user.get("avatar")
    return {
        "user_id": user.get("user_id"),
        "name": user.get("name") or user.get("display_name"),
        "username": user.get("username"),
        "picture": present_file_url(picture, viewer_id) if viewer_id else picture,
        "bio": user.get("bio"),
        "status": user.get("status"),
        "is_online": bool(user.get("is_online", False)),
        "last_seen": user.get("last_seen"),
    }


def own_profile(user: dict) -> dict:
    """Account fields for the signed-in user. Never includes the password hash."""
    profile = public_user(user, user.get("user_id"))
    profile.update({
        "email": user.get("email"),
        "phone_number": user.get("phone_number"),
        "preferred_language": user.get("preferred_language", "en"),
        "country_code": user.get("country_code"),
        "email_verified": bool(user.get("email_verified", False)),
        "phone_verified": bool(user.get("phone_verified", False)),
    })
    return profile


async def public_profiles(user_ids, viewer_id: Optional[str] = None) -> list:
    ids = []
    seen = set()
    for user_id in user_ids:
        if isinstance(user_id, str) and user_id not in seen:
            seen.add(user_id)
            ids.append(user_id)
    if not ids:
        return []
    users = await db.users.find(
        {"user_id": {"$in": ids}},
        {"_id": 0, "password": 0},
    ).to_list(len(ids))
    return [public_user(user, viewer_id) for user in users]


PAGE_MAX = 100
MESSAGE_PAGE_DEFAULT = 50
CONVERSATION_PAGE_DEFAULT = 100


def bounded_limit(limit: Optional[int], default: int) -> int:
    try:
        value = int(limit)
    except (TypeError, ValueError):
        return default
    if value < 1:
        return 1
    return min(value, PAGE_MAX)


def encode_cursor(created_at: str, doc_id) -> str:
    raw = json.dumps({"t": created_at, "id": str(doc_id)}, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str):
    if not isinstance(cursor, str) or not cursor.strip():
        raise HTTPException(status_code=422, detail="Invalid cursor")
    padded = cursor.strip() + ("=" * (-len(cursor.strip()) % 4))
    try:
        data = json.loads(base64.urlsafe_b64decode(padded.encode()))
        created_at = data["t"]
        oid = ObjectId(data["id"])
    except (KeyError, TypeError, ValueError, InvalidId, json.JSONDecodeError):
        raise HTTPException(status_code=422, detail="Invalid cursor")
    if not isinstance(created_at, str) or not created_at:
        raise HTTPException(status_code=422, detail="Invalid cursor")
    return created_at, oid


def older_than_field(field: str, stamp: str, oid) -> dict:
    return {"$or": [
        {field: {"$lt": stamp}},
        {field: stamp, "_id": {"$lt": oid}},
    ]}


def message_snapshot(msg: dict) -> dict:
    content = msg.get("content") if isinstance(msg.get("content"), str) else ""
    emoji = msg.get("emoji_content") if isinstance(msg.get("emoji_content"), str) else ""
    return {
        "message_id": msg.get("message_id"),
        "sender_id": msg.get("sender_id"),
        "sender_name": msg.get("sender_name"),
        "content": content[:140],
        "emoji_content": emoji[:140],
        "message_type": msg.get("message_type") or "text",
        "created_at": msg.get("created_at"),
        "file_url": msg.get("file_url"),
    }


async def record_last_message(conversation_id: str, msg: dict) -> None:
    stamp = msg.get("created_at") or datetime.now(timezone.utc).isoformat()
    await db.conversations.update_one(
        {
            "conversation_id": conversation_id,
            "$or": [
                {"last_message_at": {"$lt": stamp}},
                {"last_message_at": {"$exists": False}},
                {"last_message_at": None},
            ],
        },
        {"$set": {"last_message_at": stamp, "last_message": message_snapshot(msg)}},
    )


def backfill_last_message_activity() -> int:
    """Set last_message_at once on conversations that do not have it yet."""
    updated = 0
    from pymongo import MongoClient
    with MongoClient(mongo_url) as client:
        sync = client[db.name]
        missing = sync.conversations.find(
            {"$or": [{"last_message_at": {"$exists": False}}, {"last_message_at": None}]},
            {"conversation_id": 1, "created_at": 1},
        )
        for conv in missing:
            latest = sync.messages.find_one(
                {"conversation_id": conv.get("conversation_id")},
                sort=[("conversation_id", 1), ("created_at", -1), ("_id", -1)],
            )
            if latest:
                fields = {
                    "last_message_at": latest.get("created_at") or conv.get("created_at") or "",
                    "last_message": message_snapshot(latest),
                }
            else:
                fields = {"last_message_at": conv.get("created_at") or ""}
            sync.conversations.update_one({"_id": conv["_id"]}, {"$set": fields})
            updated += 1
    return updated


async def unread_counts_for(conversation_ids: List[str], user_id: str) -> dict:
    if not conversation_ids:
        return {}
    rows = await db.messages.aggregate([
        {"$match": {
            "conversation_id": {"$in": conversation_ids},
            "sender_id": {"$ne": user_id},
            "read_by": {"$nin": [user_id]},
        }},
        {"$group": {"_id": "$conversation_id", "count": {"$sum": 1}}},
    ]).to_list(len(conversation_ids))
    return {row["_id"]: int(row["count"]) for row in rows}


@api_router.get("/users/search")
async def search_users(q: str, request: Request):
    current_user = await get_current_user(request)
    await enforce_named_rate_limit(
        f"user_search:{current_user['user_id']}",
        USER_SEARCH_LIMIT,
        USER_SEARCH_WINDOW,
    )
    query = (q or "").strip()[:100]
    if len(query) < USER_SEARCH_MIN_CHARS:
        return []
    safe_q = re.escape(query)
    clauses = [
        {"name": {"$regex": safe_q, "$options": "i"}},
        {"username": {"$regex": safe_q, "$options": "i"}},
    ]
    if "@" in query:
        clauses.append({"email": normalize_email(query)})
    else:
        phone = query.replace(" ", "")
        if phone.startswith("+") or phone.isdigit():
            clauses.append({"phone_number": phone})

    users = await db.users.find(
        {
            "user_id": {"$ne": current_user["user_id"]},
            "$or": clauses,
        },
        {"_id": 0},
    ).to_list(20)
    return [public_user(user, current_user["user_id"]) for user in users]

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
        {"_id": 0}
    ).to_list(100)
    
    result = []
    for user in users:
        block_record = next((b for b in blocked if b["blocked_id"] == user["user_id"]), None)
        profile = public_user(user, current_user["user_id"])
        profile["blocked_at"] = block_record["blocked_at"] if block_record else None
        result.append(profile)
    
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
    await ws_manager.send_block_update(current_user["user_id"], user_id, True)
    
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

    await ws_manager.send_block_update(current_user["user_id"], user_id, False)
    
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
        status["user_picture"] = present_file_url(user_info.get("picture"), current_user["user_id"])
        status["content_url"] = present_file_url(status.get("content_url"), current_user["user_id"])
    
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

ALLOWED_MEDIA_HOSTS = re.compile(r"^media\d*\.giphy\.com$|^i\.giphy\.com$")


def checked_external_media_url(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    if parse_file_id(url):
        return url
    try:
        parsed = urlparse(url)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid file_url")
    if parsed.scheme != "https" or not ALLOWED_MEDIA_HOSTS.match(parsed.hostname or ""):
        raise HTTPException(status_code=422, detail="Invalid file_url")
    return url


@api_router.post("/statuses")
async def create_status(request: Request):
    """Create a new status update"""
    current_user = await get_current_user(request)
    body = await request.json()

    raw_url = body.get("file_url")
    if raw_url is not None and not isinstance(raw_url, str):
        raise HTTPException(status_code=422, detail="Invalid file_url")
    content_url = checked_external_media_url(raw_url)
    status_file_id = parse_file_id(content_url)
    if status_file_id:
        await attach_owned_file(status_file_id, current_user, kind="status")
        content_url = f"/api/files/{status_file_id}"

    status_id = f"status_{uuid.uuid4().hex[:12]}"
    status_doc = {
        "status_id": status_id,
        "user_id": current_user["user_id"],
        "content_type": body.get("content_type", "text"),
        "text_content": body.get("text_content"),
        "background_color": body.get("background_color", "#8B5CF6"),
        "content_url": content_url,
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
async def forward_message(message_id: str, body: ForwardMessageBody, request: Request):
    """Forward a message to other conversations the caller belongs to."""
    current_user = await get_current_user(request)
    original = await get_message_for_user(message_id, current_user)
    if original.get("deleted"):
        raise HTTPException(status_code=404, detail="Not found")
    for conv_id in body.conversation_ids:
        await get_conversation_for_user(conv_id, current_user)

    forwarded_messages = []
    for conv_id in body.conversation_ids:
        forwarded_url = original.get("file_url")
        forwarded_file_id = parse_file_id(forwarded_url)
        if forwarded_file_id:
            await attach_owned_file(forwarded_file_id, current_user, conversation_id=conv_id)
            forwarded_url = f"/api/files/{forwarded_file_id}"
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
            "file_url": forwarded_url,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "read_by": [current_user["user_id"]],
            "reactions": {},
            "forwarded_from": message_id
        }
        
        await db.messages.insert_one(new_msg)
        await record_last_message(conv_id, new_msg)
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
        "last_message_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["user_id"]
    }
    
    await db.conversations.insert_one(conv_doc)
    
    return {
        "conversation_id": conversation_id,
        "participant_ids": all_participants,
        "name": conv_doc["name"],
        "is_group": conv_data.is_group,
        "created_at": conv_doc["created_at"],
        "last_message_at": conv_doc["last_message_at"],
    }

@api_router.get("/conversations")
async def get_conversations(
    request: Request,
    response: Response,
    limit: int = CONVERSATION_PAGE_DEFAULT,
    cursor: Optional[str] = None,
):
    current_user = await get_current_user(request)
    page_size = bounded_limit(limit, CONVERSATION_PAGE_DEFAULT)
    query = {"participant_ids": current_user["user_id"]}
    if cursor:
        stamp, oid = decode_cursor(cursor)
        query = {"$and": [query, older_than_field("last_message_at", stamp, oid)]}

    conversations = await db.conversations.find(query).sort(
        [("last_message_at", -1), ("_id", -1)]
    ).limit(page_size + 1).to_list(page_size + 1)
    has_more = len(conversations) > page_size
    conversations = conversations[:page_size]
    if has_more and conversations:
        last = conversations[-1]
        response.headers["X-Next-Cursor"] = encode_cursor(last.get("last_message_at") or "", last["_id"])

    conv_ids = [conv["conversation_id"] for conv in conversations if conv.get("conversation_id")]
    participant_ids = []
    for conv in conversations:
        participant_ids.extend(conv.get("participant_ids") or [])
    profiles = {
        profile["user_id"]: profile
        for profile in await public_profiles(participant_ids, current_user["user_id"])
    }
    unread = await unread_counts_for(conv_ids, current_user["user_id"])

    result = []
    for conv in conversations:
        participants = [
            profiles[user_id]
            for user_id in (conv.get("participant_ids") or [])
            if user_id in profiles
        ]
        last_msg = conv.get("last_message") if isinstance(conv.get("last_message"), dict) else None
        result.append({
            "conversation_id": conv["conversation_id"],
            "participants": participants,
            "name": conv.get("name"),
            "is_group": conv.get("is_group", False),
            "created_at": conv.get("created_at"),
            "last_message": present_message(last_msg, current_user["user_id"]) if last_msg else None,
            "unread_count": unread.get(conv["conversation_id"], 0),
        })
    return result

@api_router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, request: Request):
    current_user = await get_current_user(request)
    conv = await get_conversation_for_user(conversation_id, current_user)
    
    participants = await public_profiles(conv["participant_ids"], current_user["user_id"])
    
    return {
        "conversation_id": conv["conversation_id"],
        "participants": participants,
        "name": conv.get("name"),
        "is_group": conv.get("is_group", False),
        "created_at": conv["created_at"]
    }

@api_router.post("/conversations/{conversation_id}/members")
async def add_member(conversation_id: str, body: AddMemberBody, request: Request):
    current_user = await get_current_user(request)
    conv = await get_conversation_for_user(conversation_id, current_user)
    if not conv.get("is_group"):
        raise HTTPException(status_code=404, detail="Not found")
    target = await db.users.find_one({"user_id": body.user_id}, {"_id": 0, "user_id": 1})
    if not target:
        raise HTTPException(status_code=404, detail="Not found")
    if await messaging_block_detail(current_user["user_id"], [body.user_id]):
        raise HTTPException(status_code=404, detail="Not found")
    
    await db.conversations.update_one(
        {"conversation_id": conversation_id},
        {"$addToSet": {"participant_ids": body.user_id}}
    )
    
    return {"message": "Member added"}

async def messaging_block_detail(sender_id: str, participant_ids: List[str]) -> Optional[str]:
    """Return an explicit error if a block exists between the sender and anyone else."""
    others = [pid for pid in participant_ids if pid and pid != sender_id]
    if not others:
        return None
    blocked_sender = await db.blocked_users.find_one(
        {"blocker_id": {"$in": others}, "blocked_id": sender_id},
        {"_id": 1},
    )
    if blocked_sender:
        return "You cannot send messages because you are blocked in this conversation"
    sender_blocked = await db.blocked_users.find_one(
        {"blocker_id": sender_id, "blocked_id": {"$in": others}},
        {"_id": 1},
    )
    if sender_blocked:
        return "You cannot send messages because you blocked a participant in this conversation"
    return None


# ==================== MESSAGE ENDPOINTS ====================

@api_router.post("/conversations/{conversation_id}/messages")
async def send_message(conversation_id: str, msg_data: MessageCreate, request: Request):
    current_user = await get_current_user(request)
    conv = await get_conversation_for_user(conversation_id, current_user)

    block_detail = await messaging_block_detail(
        current_user["user_id"], conv.get("participant_ids") or []
    )
    if block_detail:
        raise HTTPException(status_code=403, detail=block_detail)

    if (msg_data.message_type or "text") == "text" and not (msg_data.content or "").strip():
        raise HTTPException(status_code=422, detail="Message is empty")

    file_url = checked_external_media_url(msg_data.file_url)
    file_id = parse_file_id(file_url)
    if file_id:
        await attach_owned_file(file_id, current_user, conversation_id=conversation_id)
        file_url = f"/api/files/{file_id}"
    
    # Convert text to emoji (only for text messages)
    emoji_content = ""
    translations = {}  # NO AUTO-TRANSLATION - send message as-is
    
    if msg_data.message_type == "text" and msg_data.content:
        if await llm_allowed(request, current_user, msg_data.content):
            emoji_content = await convert_text_to_emoji(msg_data.content)
        else:
            emoji_content = fallback_emoji_convert(msg_data.content)
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
        "file_url": file_url,
        "file_name": msg_data.file_name,
        "file_size": msg_data.file_size,
        "duration": msg_data.duration,
        "translations": translations,
        "reactions": {},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read_by": [current_user["user_id"]]
    }
    
    await db.messages.insert_one(msg_doc)
    await record_last_message(conversation_id, msg_doc)
    
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
        "file_url": file_url,
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

    # One push path. Clients store one row per device endpoint in push_subscriptions.
    # Delivery uses the FCM Admin SDK or Expo Push API inside _deliver_push_to_token.
    await notify_participants_new_message_push(
        conv,
        current_user["user_id"],
        current_user.get("name") or "MojiChat",
        msg_data,
        conversation_id,
        message_id,
    )

    return present_message(response_data, current_user["user_id"])

@api_router.get("/conversations/{conversation_id}/messages")
async def get_messages(
    conversation_id: str,
    request: Request,
    response: Response,
    limit: int = MESSAGE_PAGE_DEFAULT,
    before: Optional[str] = None,
    cursor: Optional[str] = None,
):
    current_user = await get_current_user(request)
    await get_conversation_for_user(conversation_id, current_user)
    page_size = bounded_limit(limit, MESSAGE_PAGE_DEFAULT)

    query = {"conversation_id": conversation_id}
    if cursor:
        created_at, oid = decode_cursor(cursor)
        query = {"$and": [query, older_than_field("created_at", created_at, oid)]}
    elif before:
        query["created_at"] = {"$lt": before}

    messages = await db.messages.find(query).sort(
        [("created_at", -1), ("_id", -1)]
    ).limit(page_size + 1).to_list(page_size + 1)
    has_more = len(messages) > page_size
    messages = messages[:page_size]
    if has_more and messages:
        oldest = messages[-1]
        response.headers["X-Next-Cursor"] = encode_cursor(oldest.get("created_at") or "", oldest["_id"])

    return [present_message(message, current_user["user_id"]) for message in reversed(messages)]


@api_router.post("/conversations/{conversation_id}/read")
async def mark_conversation_read(conversation_id: str, request: Request):
    """Mark messages read up to the one the client has seen. Loading history does not do this."""
    current_user = await get_current_user(request)
    await get_conversation_for_user(conversation_id, current_user)
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    message_id = payload.get("message_id")
    up_to = payload.get("up_to")
    criteria = {
        "conversation_id": conversation_id,
        "sender_id": {"$ne": current_user["user_id"]},
        "read_by": {"$nin": [current_user["user_id"]]},
    }
    if isinstance(message_id, str) and message_id:
        seen = await db.messages.find_one(
            {"message_id": message_id, "conversation_id": conversation_id},
            {"_id": 0, "created_at": 1},
        )
        if not seen or not isinstance(seen.get("created_at"), str):
            raise HTTPException(status_code=404, detail="Not found")
        criteria["created_at"] = {"$lte": seen["created_at"]}
    elif isinstance(up_to, str) and up_to:
        criteria["created_at"] = {"$lte": up_to}
    else:
        return {"marked": 0}
    result = await db.messages.update_many(criteria, {"$addToSet": {"read_by": current_user["user_id"]}})
    return {"marked": result.modified_count}

# ==================== TYPING & STATUS ====================

@api_router.post("/conversations/{conversation_id}/typing")
async def set_typing(conversation_id: str, status: TypingStatus, request: Request):
    current_user = await get_current_user(request)
    await get_conversation_for_user(conversation_id, current_user)
    
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
    await get_conversation_for_user(conversation_id, current_user)
    
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
    current_user = await get_current_user(request)
    await enforce_llm_limits(request, current_user, data.text)
    emoji = await convert_text_to_emoji(data.text)
    return {"original": data.text, "emoji": emoji}

# ==================== TRANSLATION ====================

async def translate_text(text: str, target_language: str, source_language: str = "auto"):
    """Return (available, text). available is false when translation cannot run."""
    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        return False, text
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

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
        return True, (response.strip() if response else text)

    except Exception as exc:
        logger.error("Translation error: %s", type(exc).__name__)
        return False, text

@api_router.post("/translate")
async def translate_endpoint(request: Request):
    """Translate text to target language with auto-detect"""
    current_user = await get_current_user(request)
    body = await request.json()
    
    text = body.get("text", "")
    if not isinstance(text, str):
        raise HTTPException(status_code=422, detail="text must be a string")
    await enforce_llm_limits(request, current_user, text)
    target_language = body.get("target_language", current_user.get("preferred_language", "en"))
    
    # If target_language is "auto", detect and use user's preferred language
    if target_language == "auto":
        target_language = current_user.get("preferred_language", "en")
    
    available, translated = await translate_text(text, target_language)
    return {
        "available": available,
        "text": translated if available else text,
        "original": text,
        "translated": translated if available else text,
        "language": target_language,
        "auto_detected": True,
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

# ==================== PROFILE PICTURE ====================

@api_router.put("/users/profile")
async def update_profile(request: Request, file: UploadFile = File(None), name: str = Form(None)):
    """Update user profile: name and/or profile picture."""
    current_user = await get_current_user(request)
    update_data = {}

    if name and name.strip():
        update_data["name"] = name.strip()

    if file:
        content = await _read_limited_upload(file)
        content_type, media_class = _checked_upload(content, images_only=True)
        await _enforce_upload_quota(current_user["user_id"], len(content))
        stored = await file_store.save(
            data=content,
            content_type=content_type,
            media_class=media_class,
            original_name=sanitize_filename(file.filename),
            uploader_id=current_user["user_id"],
            kind="avatar",
        )
        update_data["picture"] = f"/api/files/{stored['file_id']}"

    if not update_data:
        raise HTTPException(status_code=400, detail="Nothing to update.")

    await db.users.update_one(
        {"user_id": current_user["user_id"]},
        {"$set": update_data}
    )

    updated = await db.users.find_one({"user_id": current_user["user_id"]}, {"_id": 0, "password": 0})
    return {
        "user_id": updated["user_id"],
        "email": updated["email"],
        "name": updated["name"],
        "picture": present_file_url(updated.get("picture"), current_user["user_id"]),
        "preferred_language": updated.get("preferred_language", "en"),
    }

# ==================== INVITE LINKS ====================

@api_router.get("/users/invite-link")
async def get_invite_link(request: Request):
    """Get or create a personal invite link for the current user."""
    current_user = await get_current_user(request)
    user_id = current_user["user_id"]

    existing = await db.invite_links.find_one({"user_id": user_id}, {"_id": 0})
    if existing:
        return {"invite_code": existing["invite_code"], "invite_link": existing["invite_link"]}

    invite_code = uuid.uuid4().hex[:10]
    base_url = os.environ.get("FRONTEND_URL", "https://moji-chat-gamma.vercel.app")
    invite_link = f"{base_url}/join/{invite_code}"

    await db.invite_links.insert_one({
        "user_id": user_id,
        "invite_code": invite_code,
        "invite_link": invite_link,
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    return {"invite_code": invite_code, "invite_link": invite_link}


@api_router.post("/users/join/{invite_code}")
async def join_via_invite(invite_code: str, request: Request):
    """Start a conversation with the user who owns this invite link."""
    current_user = await get_current_user(request)

    invite = await db.invite_links.find_one({"invite_code": invite_code}, {"_id": 0})
    if not invite:
        raise HTTPException(status_code=404, detail="Invalid invite link.")

    owner_id = invite["user_id"]
    if owner_id == current_user["user_id"]:
        raise HTTPException(status_code=400, detail="You cannot invite yourself.")

    # Check if conversation already exists
    existing = await db.conversations.find_one({
        "participant_ids": {"$all": [current_user["user_id"], owner_id]},
        "is_group": False
    })
    if existing:
        return {"conversation_id": existing["conversation_id"], "already_exists": True}

    conv_id = f"conv_{uuid.uuid4().hex[:12]}"
    await db.conversations.insert_one({
        "conversation_id": conv_id,
        "participant_ids": [current_user["user_id"], owner_id],
        "is_group": False,
        "name": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    return {"conversation_id": conv_id, "already_exists": False}

# ==================== GET USER BY ID ====================
# NOTE: This dynamic route must be registered AFTER all specific `/users/...`
# GET routes (e.g. /users/blocked, /users/invite-link); otherwise it shadows
# them and they return 404.
@api_router.get("/users/{user_id}")
async def get_user(user_id: str, request: Request):
    current_user = await get_current_user(request)

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user_id == current_user["user_id"]:
        return own_profile(user)
    return public_user(user, current_user["user_id"])

# ==================== FILE UPLOAD ====================

async def _read_limited_upload(file: UploadFile) -> bytes:
    ceiling = upload_byte_ceiling()
    content = await file.read(ceiling + 1)
    if len(content) > ceiling:
        raise HTTPException(status_code=413, detail="File is too large")
    return content


def _voice_body_limit() -> int:
    decoded = max_bytes_for("audio")
    encoded = 4 * ((decoded + 2) // 3)
    return encoded + 2048


async def _read_capped_body(request: Request, limit: int) -> bytes:
    """Read a JSON body, streaming when Content-Length is absent."""
    declared = request.headers.get("content-length")
    if declared is not None and str(declared).strip() != "":
        try:
            if int(declared) > limit:
                raise HTTPException(status_code=413, detail="File is too large")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid audio data")
        raw = await request.body()
        if len(raw) > limit:
            raise HTTPException(status_code=413, detail="File is too large")
        return raw
    chunks = []
    total = 0
    async for chunk in request.stream():
        if not chunk:
            continue
        if total + len(chunk) > limit:
            raise HTTPException(status_code=413, detail="File is too large")
        total += len(chunk)
        chunks.append(chunk)
    return b"".join(chunks)


async def _enforce_upload_quota(user_id: str, extra_bytes: int):
    since = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    rows = await db.stored_files.aggregate([
        {"$match": {"uploader_id": user_id, "created_at": {"$gte": since}}},
        {"$group": {"_id": None, "total": {"$sum": "$size"}}},
    ]).to_list(1)
    used = int(rows[0]["total"]) if rows else 0
    if used + extra_bytes > upload_daily_bytes():
        raise HTTPException(
            status_code=429,
            detail="Upload quota exceeded",
            headers={"Retry-After": "86400"},
        )


def _checked_upload(content: bytes, *, images_only: bool = False, voice: bool = False):
    if content and len(content) > upload_byte_ceiling():
        raise HTTPException(status_code=413, detail="File is too large")
    detected = detect_upload(content)
    if not detected:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    content_type, media_class = detected
    if images_only and media_class != "image":
        raise HTTPException(status_code=400, detail="Only image files are allowed for profile picture.")
    if voice:
        if media_class == "audio":
            pass
        elif content_type in ("video/webm", "video/mp4", "video/3gpp"):
            media_class = "audio"
            content_type = {
                "video/webm": "audio/webm",
                "video/mp4": "audio/mp4",
                "video/3gpp": "audio/3gpp",
            }[content_type]
        else:
            raise HTTPException(status_code=400, detail="Unsupported audio type")
    if len(content) > max_bytes_for(media_class):
        raise HTTPException(status_code=413, detail="File is too large")
    return content_type, media_class


async def user_can_read_file(user: dict, meta: dict) -> bool:
    if meta.get("kind") == "avatar":
        return True
    if meta.get("uploader_id") == user.get("user_id"):
        return True
    for conversation_id in meta.get("conversation_ids") or []:
        try:
            await get_conversation_for_user(conversation_id, user)
            return True
        except HTTPException:
            continue
    if meta.get("kind") == "status" and meta.get("uploader_id"):
        shared = await db.conversations.find_one(
            {"participant_ids": {"$all": [user["user_id"], meta["uploader_id"]]}},
            {"_id": 1},
        )
        return shared is not None
    return False


async def attach_owned_file(file_id: str, user: dict, *, conversation_id: str = None, kind: str = None):
    meta = await file_store.get_meta(file_id)
    if not meta or not await user_can_read_file(user, meta):
        raise HTTPException(status_code=404, detail="File not found")
    if kind is not None:
        if meta.get("kind") == "avatar" or meta.get("uploader_id") != user.get("user_id"):
            raise HTTPException(status_code=404, detail="File not found")
    await file_store.link(file_id, conversation_id=conversation_id, kind=kind)


async def release_message_file(message: dict):
    """Drop this conversation's claim. Delete the bytes when nothing else uses the file."""
    file_id = parse_file_id(message.get("file_url"))
    conversation_id = message.get("conversation_id")
    if not file_id or not conversation_id:
        return
    canonical = f"/api/files/{file_id}"
    others = await db.messages.count_documents({
        "file_url": canonical,
        "conversation_id": conversation_id,
        "message_id": {"$ne": message.get("message_id")},
        "deleted": {"$ne": True},
    })
    if others:
        return
    await file_store.pull_conversation(file_id, conversation_id)
    meta = await file_store.get_meta(file_id)
    if not meta or meta.get("conversation_ids") or meta.get("kind") in ("avatar", "status"):
        return
    if await db.users.find_one({"picture": canonical}, {"_id": 1}):
        return
    if await db.statuses.find_one({"content_url": canonical}, {"_id": 1}):
        return
    await file_store.delete(file_id)


def _canonical_file_url(url: Optional[str]) -> Optional[str]:
    file_id = parse_file_id(url)
    if not file_id:
        return url
    return f"/api/files/{file_id}"


@api_router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...)):
    """Upload a file (image, video, audio, document)"""
    current_user = await get_current_user(request)
    content = await _read_limited_upload(file)
    content_type, media_class = _checked_upload(content)
    await _enforce_upload_quota(current_user["user_id"], len(content))
    stored = await file_store.save(
        data=content,
        content_type=content_type,
        media_class=media_class,
        original_name=sanitize_filename(file.filename),
        uploader_id=current_user["user_id"],
        kind="upload",
    )
    return {
        "file_id": stored["file_id"],
        "file_url": present_file_url(f"/api/files/{stored['file_id']}", current_user["user_id"]),
        "file_name": stored["original_name"],
        "file_size": stored["size"],
        "file_type": media_class if media_class != "file" else "file",
        "mime_type": content_type,
    }


@api_router.get("/files/{file_id}")
async def get_file(
    file_id: str,
    request: Request,
    uid: Optional[str] = None,
    exp: Optional[str] = None,
    sig: Optional[str] = None,
):
    """Serve a stored file to an authorized viewer or a valid signed URL."""
    auth_header = request.headers.get("Authorization") or ""
    if auth_header.startswith("Bearer "):
        current_user = await get_current_user(request)
    elif uid and exp and sig and verify_file_signature(file_id, uid, exp, sig):
        current_user = await db.users.find_one({"user_id": uid}, {"_id": 0, "password": 0})
        if not current_user:
            raise HTTPException(status_code=401, detail="Not authenticated")
    else:
        raise HTTPException(status_code=401, detail="Not authenticated")

    meta = await file_store.get_meta(file_id)
    if not meta or not await user_can_read_file(current_user, meta):
        raise HTTPException(status_code=404, detail="File not found")
    size = int(meta.get("size") or 0)
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": content_disposition(meta["media_class"], meta.get("original_name")),
        "Cache-Control": f"private, max-age={file_url_window()}",
        "Accept-Ranges": "bytes",
    }
    byte_range = parse_byte_range(request.headers.get("range"), size)
    if byte_range == "invalid":
        headers["Content-Range"] = f"bytes */{size}"
        return Response(status_code=416, headers=headers)
    if byte_range is None:
        data = await file_store.read(meta)
        return Response(content=data, media_type=meta["content_type"], headers=headers)
    start, end = byte_range
    data = await file_store.read(meta, start, end)
    headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return Response(content=data, status_code=206, media_type=meta["content_type"], headers=headers)

# ==================== VOICE MESSAGE ====================

@api_router.post("/voice/upload")
async def upload_voice(request: Request):
    """Upload voice message as base64"""
    current_user = await get_current_user(request)
    raw = await _read_capped_body(request, _voice_body_limit())
    try:
        body = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid audio data")

    audio_data = body.get("audio_data")  # base64 encoded
    duration = body.get("duration", 0)

    if not isinstance(audio_data, str) or not audio_data:
        raise HTTPException(status_code=400, detail="No audio data provided")

    payload = audio_data.split(",", 1)[1] if "," in audio_data[:128] else audio_data
    decoded_cap = max_bytes_for("audio")
    if len(payload) > 4 * ((decoded_cap + 2) // 3):
        raise HTTPException(status_code=413, detail="File is too large")

    try:
        audio_bytes = base64.b64decode(payload, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid audio data")

    content_type, media_class = _checked_upload(audio_bytes, voice=True)
    await _enforce_upload_quota(current_user["user_id"], len(audio_bytes))
    stored = await file_store.save(
        data=audio_bytes,
        content_type=content_type,
        media_class=media_class,
        original_name="voice.webm" if content_type == "video/webm" else "voice",
        uploader_id=current_user["user_id"],
        kind="voice",
    )
    return {
        "file_id": stored["file_id"],
        "file_url": present_file_url(f"/api/files/{stored['file_id']}", current_user["user_id"]),
        "duration": duration,
        "file_size": stored["size"],
    }

# ==================== DELETE MESSAGE ====================

@api_router.delete("/messages/{message_id}")
async def delete_message(message_id: str, request: Request):
    """Delete a message. Only the sender can delete their own message."""
    current_user = await get_current_user(request)
    message = await get_message_for_user(message_id, current_user)

    if message["sender_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="You can only delete your own messages")

    await release_message_file(message)

    # Soft-delete: replace content with deleted marker so other clients can update UI
    await db.messages.update_one(
        {"message_id": message_id},
        {"$set": {
            "deleted": True,
            "content": "",
            "emoji_content": "",
            "file_url": None,
            "deleted_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    await db.conversations.update_one(
        {"conversation_id": message["conversation_id"], "last_message.message_id": message_id},
        {"$set": {
            "last_message.content": "",
            "last_message.emoji_content": "",
            "last_message.file_url": None,
            "last_message.deleted": True,
        }},
    )

    # Notify conversation participants via WebSocket
    await ws_manager.broadcast_to_conversation(
        message["conversation_id"],
        {
            "type": "message_deleted",
            "message_id": message_id,
            "conversation_id": message["conversation_id"],
        }
    )

    return {"message": "Deleted", "message_id": message_id}

# ==================== MESSAGE REACTIONS ====================

@api_router.post("/messages/{message_id}/reactions")
async def add_reaction(message_id: str, reaction: ReactionCreate, request: Request):
    """Add emoji reaction to a message"""
    current_user = await get_current_user(request)
    await get_message_for_user(message_id, current_user)
    emoji = reaction.emoji
    await db.messages.update_one(
        {"message_id": message_id},
        {"$addToSet": {f"reactions.{emoji}": current_user["user_id"]}},
    )
    updated = await db.messages.find_one({"message_id": message_id}, {"_id": 0, "reactions": 1})
    return {"message": "Reaction added", "reactions": (updated or {}).get("reactions") or {}}

@api_router.delete("/messages/{message_id}/reactions/{emoji}")
async def remove_reaction(message_id: str, emoji: str, request: Request):
    """Remove emoji reaction from a message"""
    current_user = await get_current_user(request)
    await get_message_for_user(message_id, current_user)
    try:
        emoji = ReactionCreate(emoji=emoji).emoji
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid emoji")
    await db.messages.update_one(
        {"message_id": message_id},
        {"$pull": {f"reactions.{emoji}": current_user["user_id"]}},
    )
    await db.messages.update_one(
        {"message_id": message_id, f"reactions.{emoji}": {"$size": 0}},
        {"$unset": {f"reactions.{emoji}": ""}},
    )
    updated = await db.messages.find_one({"message_id": message_id}, {"_id": 0, "reactions": 1})
    return {"message": "Reaction removed", "reactions": (updated or {}).get("reactions") or {}}

# ==================== GIPHY INTEGRATION ====================

def giphy_unavailable(offset: int = 0, reason: str = "not_configured") -> dict:
    """Soft response used when GIFs cannot be loaded. Never a 500."""
    return {
        "available": False,
        "results": [],
        "gifs": [],
        "total_count": 0,
        "offset": offset,
        "reason": reason,
    }


def _gifs_from_giphy_payload(data: dict) -> list:
    gifs = []
    for gif in data.get("data", []):
        try:
            images = gif["images"]
            gifs.append({
                "id": gif["id"],
                "title": gif.get("title", ""),
                "url": images["fixed_height"]["url"],
                "preview_url": images["fixed_height_small"]["url"],
                "original_url": images["original"]["url"],
                "width": int(images["fixed_height"]["width"]),
                "height": int(images["fixed_height"]["height"]),
            })
        except (KeyError, TypeError, ValueError):
            continue
    return gifs


def _giphy_success(gifs: list, total_count: int, offset: int) -> dict:
    return {
        "available": True,
        "results": gifs,
        "gifs": gifs,
        "total_count": total_count,
        "offset": offset,
    }


async def _fetch_giphy(path: str, params: dict, offset: int) -> dict:
    if not GIPHY_API_KEY:
        return giphy_unavailable(offset, "not_configured")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"https://api.giphy.com/v1/gifs/{path}", params=params)
        if response.status_code != 200:
            logger.warning("Giphy %s returned %s", path, response.status_code)
            return giphy_unavailable(offset, "upstream")
        data = response.json()
        gifs = _gifs_from_giphy_payload(data)
        total = data.get("pagination", {}).get("total_count", 0)
        return _giphy_success(gifs, total, offset)
    except Exception as e:
        logger.error(f"Giphy API error: {e}")
        return giphy_unavailable(offset, "upstream")


@api_router.get("/giphy/search")
async def search_giphy(q: str, request: Request, limit: int = 20, offset: int = 0):
    """Search for GIFs using Giphy API. Auth is required before a key is configured."""
    await get_current_user(request)
    await enforce_rate_limit(request, bucket="giphy", limit=30, window_seconds=60)
    return await _fetch_giphy(
        "search",
        {
            "api_key": GIPHY_API_KEY,
            "q": q,
            "limit": min(limit, 50),
            "offset": offset,
            "rating": "g",
            "lang": "en",
        },
        offset,
    )

@api_router.get("/giphy/trending")
async def trending_giphy(request: Request, limit: int = 20, offset: int = 0):
    """Get trending GIFs from Giphy. Auth is required before a key is configured."""
    await get_current_user(request)
    await enforce_rate_limit(request, bucket="giphy", limit=30, window_seconds=60)
    return await _fetch_giphy(
        "trending",
        {
            "api_key": GIPHY_API_KEY,
            "limit": min(limit, 50),
            "offset": offset,
            "rating": "g",
        },
        offset,
    )

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

# ==================== MESSAGE SEARCH ====================

SEARCH_QUERY_MAX = 100

@api_router.get("/search/messages")
async def search_messages(q: str, request: Request, conversation_id: Optional[str] = None):
    """Search messages by content inside conversations the caller belongs to."""
    current_user = await get_current_user(request)
    if conversation_id is not None:
        await get_conversation_for_user(conversation_id, current_user)
        conv_ids = [conversation_id]
    else:
        user_convs = await db.conversations.find(
            {"participant_ids": current_user["user_id"]},
            {"conversation_id": 1, "_id": 0}
        ).to_list(100)
        conv_ids = [c["conversation_id"] for c in user_convs]

    text = (q or "").strip()[:SEARCH_QUERY_MAX]
    if not text or not conv_ids:
        return []

    safe_q = re.escape(text)
    query = {
        "conversation_id": {"$in": conv_ids},
        "$or": [
            {"content": {"$regex": safe_q, "$options": "i"}},
            {"emoji_content": {"$regex": safe_q, "$options": "i"}}
        ]
    }
    
    messages = await db.messages.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).limit(50).to_list(50)
    
    return [present_message(message, current_user["user_id"]) for message in messages]

@api_router.get("/search/conversations")
async def search_conversations(q: str, request: Request):
    """Search conversations by name or participant"""
    current_user = await get_current_user(request)
    
    if not q.strip():
        return []
    
    conversations = await db.conversations.find(
        {"participant_ids": current_user["user_id"]},
        {"_id": 0}
    ).sort([("created_at", -1)]).limit(CONVERSATION_PAGE_DEFAULT).to_list(CONVERSATION_PAGE_DEFAULT)

    participant_ids = []
    for conv in conversations:
        participant_ids.extend(conv.get("participant_ids") or [])
    profiles = {
        profile["user_id"]: profile
        for profile in await public_profiles(participant_ids, current_user["user_id"])
    }

    results = []
    for conv in conversations:
        participants = [
            profiles[user_id]
            for user_id in (conv.get("participant_ids") or [])
            if user_id in profiles
        ]
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

def _plain_json(value, depth: int = 0):
    """Reject Mongo operators inside stored signal payloads."""
    if depth > 6:
        raise ValueError("signal data is too deep")
    if isinstance(value, dict):
        cleaned = {}
        for key, item in value.items():
            if not isinstance(key, str) or key.startswith("$") or "." in key:
                raise ValueError("signal data has an invalid key")
            cleaned[key] = _plain_json(item, depth + 1)
        return cleaned
    if isinstance(value, list):
        if len(value) > 50:
            raise ValueError("signal data is too long")
        return [_plain_json(item, depth + 1) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        if isinstance(value, str) and len(value) > 20000:
            raise ValueError("signal data is too long")
        return value
    raise ValueError("signal data has an invalid value")


class CallSignal(BaseModel):
    type: str  # offer, answer, ice-candidate
    data: dict
    target_user_id: Optional[str] = None

    @field_validator("type")
    @classmethod
    def plain_type(cls, value: str) -> str:
        if not value.strip() or len(value) > 40 or value.startswith("$"):
            raise ValueError("invalid signal type")
        return value

    @field_validator("data")
    @classmethod
    def plain_data(cls, value: dict) -> dict:
        return _plain_json(value)

    @field_validator("target_user_id")
    @classmethod
    def plain_target(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        if not value.strip() or len(value) > 80 or value.startswith("$") or "." in value:
            raise ValueError("invalid target")
        return value

@api_router.post("/calls/initiate")
async def initiate_call(body: CallInitiateBody, request: Request):
    """Initiate a video call"""
    current_user = await get_current_user(request)
    conv = await get_conversation_for_user(body.conversation_id, current_user)
    conversation_id = body.conversation_id
    is_video = body.is_video
    
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
    call = await get_call_for_user(call_id, current_user)
    
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
    await get_call_for_user(call_id, current_user)
    
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
    await get_call_for_user(call_id, current_user)
    
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
    await get_call_for_user(call_id, current_user)
    
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

def _push_preview_body(msg_data: MessageCreate) -> str:
    """Short line for notification body."""
    mt = (msg_data.message_type or "text").lower()
    if mt == "text":
        t = (msg_data.content or "").strip()
        return (t[:120] + "…") if len(t) > 120 else (t or "New message")
    return {
        "image": "📷 Photo",
        "video": "🎥 Video",
        "audio": "🎤 Voice message",
        "file": "📎 File",
        "gif": "GIF",
    }.get(mt, "New message")


def _fcm_string_data(data: Optional[dict]) -> dict:
    if not data:
        return {}
    return {str(k): str(v) for k, v in data.items()}


async def _deliver_push_to_token(
    token: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
    android_channel_id: str = "default",
) -> dict:
    """Send one push via FCM (non-Expo token) or Expo Push API. Returns status dict."""
    if not token:
        return {"success": False, "message": "No token"}

    if firebase_app and not str(token).startswith("ExponentPushToken"):
        try:
            fcm_message = fcm_messaging.Message(
                notification=fcm_messaging.Notification(title=title, body=body),
                data=_fcm_string_data(data),
                token=token,
                android=fcm_messaging.AndroidConfig(
                    priority="high",
                    notification=fcm_messaging.AndroidNotification(
                        sound="default",
                        channel_id=android_channel_id,
                    ),
                ),
            )
            fcm_messaging.send(fcm_message)
            logger.info("FCM push sent")
            return {"success": True, "message": "FCM push notification sent!"}
        except Exception as e:
            logger.error("FCM push error: %s", type(e).__name__)
            await drop_unregistered_push_token(token, exc=e)
            return {"success": False, "message": "FCM push failed"}

    EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
    message = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
        "priority": "high",
        "channelId": android_channel_id,
    }
    if data:
        message["data"] = data

    logger.info("Sending push notification")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                EXPO_PUSH_URL,
                json=message,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                },
            )
            result = response.json()
            logger.info("Expo push request finished status=%s", response.status_code)

            if response.status_code == 200 and "data" in result:
                ticket = result["data"]
                if isinstance(ticket, list):
                    ticket = ticket[0] if ticket else {}
                if not isinstance(ticket, dict):
                    ticket = {}
                if ticket.get("status") == "ok":
                    return {
                        "success": True,
                        "message": "Push notification sent successfully!",
                        "ticket_id": ticket.get("id"),
                        "details": ticket,
                    }
                await drop_unregistered_push_token(token, ticket=ticket)
                return {
                    "success": False,
                    "message": "Push notification failed",
                }
            if response.status_code == 200:
                return {"success": True, "message": "Request sent", "details": result}
            return {"success": False, "message": f"HTTP {response.status_code}", "details": result}
    except Exception as e:
        logger.error("Push notification error: %s", type(e).__name__)
        return {"success": False, "message": "Push notification failed"}


async def notify_participants_new_message_push(
    conv: dict,
    sender_id: str,
    sender_name: str,
    msg_data: MessageCreate,
    conversation_id: str,
    message_id: str,
) -> None:
    """Notify all participants except sender that a new message arrived (Expo / FCM)."""
    participant_ids = conv.get("participant_ids") or []
    targets = [uid for uid in participant_ids if uid != sender_id]
    if not targets:
        return

    preview = _push_preview_body(msg_data)
    title = sender_name or "MojiChat"
    payload = {
        "type": "new_message",
        "conversation_id": conversation_id,
        "message_id": message_id,
    }

    async def one(uid: str):
        try:
            subs = await db.push_subscriptions.find(
                {"user_id": uid, "token_type": {"$ne": "web"}},
                {"_id": 0, "endpoint": 1, "device_id": 1},
            ).to_list(50)
            for tok in choose_push_endpoints(subs):
                res = await _deliver_push_to_token(
                    tok, title, preview, payload, android_channel_id="messages"
                )
                if not res.get("success"):
                    logger.warning("new_message push failed for user %s", uid)
        except Exception as e:
            logger.warning("new_message push error for user %s: %s", uid, type(e).__name__)

    await asyncio.gather(*[one(uid) for uid in targets], return_exceptions=True)


def push_failure_is_unregistered(ticket=None, exc=None) -> bool:
    """Expo DeviceNotRegistered, or FCM UnregisteredError / registration-token-not-registered."""
    if isinstance(ticket, dict):
        details = ticket.get("details") if isinstance(ticket.get("details"), dict) else {}
        if details.get("error") == "DeviceNotRegistered":
            return True
    if exc is not None:
        if type(exc).__name__ == "UnregisteredError":
            return True
        text = f"{getattr(exc, 'code', '')} {exc}".lower()
        if "registration-token-not-registered" in text:
            return True
    return False


async def drop_unregistered_push_token(token: str, ticket=None, exc=None) -> bool:
    if not token or not push_failure_is_unregistered(ticket=ticket, exc=exc):
        return False
    try:
        await db.push_subscriptions.delete_many({"endpoint": token})
    except Exception as cleanup_error:
        logger.warning("dead push token cleanup failed: %s", type(cleanup_error).__name__)
        return False
    return True


def choose_push_endpoints(subs: list) -> list:
    """One token per device. A phone may store both an Expo token and a native token."""
    groups = {}
    order = []
    for sub in subs:
        endpoint = sub.get("endpoint") if isinstance(sub, dict) else None
        if not isinstance(endpoint, str) or not endpoint:
            continue
        device = sub.get("device_id")
        if not isinstance(device, str) or not device.strip():
            device = endpoint
        else:
            device = device.strip()
        if device not in groups:
            groups[device] = []
            order.append(device)
        groups[device].append(endpoint)
    chosen = []
    for device in order:
        tokens = groups[device]
        expo = next((tok for tok in tokens if tok.startswith("ExponentPushToken")), None)
        chosen.append(expo or tokens[0])
    return chosen


def push_endpoints_from_body(body) -> list:
    if not isinstance(body, dict):
        return []
    found = []
    endpoint = body.get("endpoint")
    if isinstance(endpoint, str) and endpoint.strip():
        found.append(endpoint.strip())
    endpoints = body.get("endpoints")
    if isinstance(endpoints, list):
        for item in endpoints:
            if isinstance(item, str) and item.strip() and item.strip() not in found:
                found.append(item.strip())
    return found


async def push_endpoints_from_request(request: Request) -> list:
    try:
        body = await request.json()
    except Exception:
        return []
    return push_endpoints_from_body(body)


async def delete_push_endpoints(user_id: str, endpoints: list) -> None:
    if not endpoints:
        return
    await db.push_subscriptions.delete_many({
        "user_id": user_id,
        "endpoint": {"$in": endpoints},
    })


async def upsert_push_subscription(user_id: str, endpoint: str, keys: dict, token_type: str, device_id: Optional[str]) -> None:
    endpoint = (endpoint or "").strip()
    if not endpoint:
        raise HTTPException(status_code=400, detail="endpoint is required")
    device = (device_id or "").strip() or endpoint
    now = datetime.now(timezone.utc).isoformat()
    await db.push_subscriptions.update_one(
        {"endpoint": endpoint},
        {
            "$set": {
                "user_id": user_id,
                "endpoint": endpoint,
                "keys": keys,
                "token_type": token_type,
                "device_id": device,
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict
    device_id: Optional[str] = None

@api_router.post("/notifications/subscribe")
async def subscribe_push(subscription: PushSubscription, request: Request):
    """Store one push endpoint. A second device does not replace the first."""
    current_user = await get_current_user(request)
    token_type = "web"
    if subscription.keys.get("expo"):
        token_type = "expo"
    elif subscription.keys.get("fcm"):
        token_type = "fcm"
    await upsert_push_subscription(
        current_user["user_id"],
        subscription.endpoint,
        subscription.keys,
        token_type,
        subscription.device_id,
    )
    return {"status": "subscribed", "firebase_enabled": firebase_app is not None}

@api_router.post("/notifications/subscribe-fcm")
async def subscribe_fcm(request: Request):
    """Subscribe with FCM device token"""
    current_user = await get_current_user(request)
    body = await request.json()
    fcm_token = body.get("fcm_token")
    if not isinstance(fcm_token, str) or not fcm_token.strip():
        raise HTTPException(status_code=400, detail="fcm_token is required")
    device_id = body.get("device_id") if isinstance(body.get("device_id"), str) else None
    await upsert_push_subscription(
        current_user["user_id"],
        fcm_token.strip(),
        {"fcm": True},
        "fcm",
        device_id,
    )
    return {"status": "subscribed", "token_type": "fcm"}

@api_router.delete("/notifications/unsubscribe")
async def unsubscribe_push(request: Request):
    """Remove this device's push endpoints. Other devices stay registered."""
    current_user = await get_current_user(request)
    endpoints = await push_endpoints_from_request(request)
    if not endpoints:
        raise HTTPException(status_code=400, detail="endpoint is required")
    await delete_push_endpoints(current_user["user_id"], endpoints)
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
        account = await db.users.find_one({"user_id": token_user_id}, {"_id": 0, "token_version": 1})
        if not account or token_version_of(payload.get("token_version")) != token_version_of(account.get("token_version")):
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
                conversation_id = data.get("conversation_id")
                is_typing = data.get("is_typing", False)
                caller = {"user_id": user_id}
                try:
                    await get_conversation_for_user(conversation_id, caller)
                except HTTPException:
                    await websocket.send_json({"type": "error", "status": 404, "detail": "Not found"})
                    continue
                user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "name": 1})
                user_name = user.get("name", "User") if user else "User"
                await ws_manager.send_typing_indicator(
                    conversation_id, user_id, user_name, bool(is_typing)
                )
                
            elif message_type == "message_read":
                conversation_id = data.get("conversation_id")
                message_id = data.get("message_id")
                caller = {"user_id": user_id}
                try:
                    await get_conversation_for_user(conversation_id, caller)
                except HTTPException:
                    await websocket.send_json({"type": "error", "status": 404, "detail": "Not found"})
                    continue
                if not isinstance(message_id, str) or not message_id:
                    await websocket.send_json({"type": "error", "status": 404, "detail": "Not found"})
                    continue
                message = await db.messages.find_one(
                    {"message_id": message_id, "conversation_id": conversation_id},
                    {"_id": 0, "message_id": 1},
                )
                if not message:
                    await websocket.send_json({"type": "error", "status": 404, "detail": "Not found"})
                    continue
                await db.messages.update_one(
                    {"message_id": message_id, "conversation_id": conversation_id},
                    {"$addToSet": {"read_by": user_id}}
                )
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
                conversation_id = data.get("conversation_id")
                try:
                    await get_conversation_for_user(conversation_id, {"user_id": user_id})
                except HTTPException:
                    await websocket.send_json({"type": "error", "status": 404, "detail": "Not found"})
                    continue
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


async def _safe_index(label: str, awaitable):
    """One failed index must not skip the rest."""
    try:
        await awaitable
    except Exception as exc:
        logger.warning("index %s not created: %s", label, type(exc).__name__)


EMAIL_UNIQUE_PARTIAL = {"email": {"$type": "string", "$gt": ""}}


def _email_index_is_ready(spec: dict) -> bool:
    key = list(spec.get("key") or [])
    if key != [("email", 1)] or not spec.get("unique"):
        return False
    partial = spec.get("partialFilterExpression") or {}
    email_filter = partial.get("email") or {}
    if email_filter.get("$type") != "string" or email_filter.get("$gt") != "":
        return False
    collation = spec.get("collation") or {}
    return collation.get("locale") == "en" and collation.get("strength") == 2


def ensure_unique_email_index() -> str:
    """Partial unique index on a non-empty email. Case variants count as one address.

    Existing duplicates are logged and the index is left unchanged so startup still boots.
    """
    from pymongo import MongoClient
    from pymongo.collation import Collation

    try:
        with MongoClient(mongo_url) as client:
            sync = client[db.name]
            collisions = list(sync.users.aggregate([
                {"$match": {"email": {"$type": "string"}}},
                {"$project": {
                    "user_id": 1,
                    "norm": {"$toLower": {"$trim": {"input": "$email"}}},
                }},
                {"$match": {"norm": {"$gt": ""}}},
                {"$group": {
                    "_id": "$norm",
                    "ids": {"$push": "$user_id"},
                    "count": {"$sum": 1},
                }},
                {"$match": {"count": {"$gt": 1}}},
                {"$limit": 20},
            ]))
            if collisions:
                logger.warning(
                    "email unique index skipped collisions=%s user_ids=%s",
                    len(collisions),
                    [row.get("ids") for row in collisions],
                )
                return "skipped"
            info = sync.users.index_information()
            for name, spec in list(info.items()):
                if list(spec.get("key") or []) != [("email", 1)]:
                    continue
                if _email_index_is_ready(spec):
                    return "exists"
                sync.users.drop_index(name)
            sync.users.create_index(
                "email",
                unique=True,
                name="users_email_unique",
                partialFilterExpression=EMAIL_UNIQUE_PARTIAL,
                collation=Collation(locale="en", strength=2),
                background=True,
            )
            return "created"
    except Exception as exc:
        logger.warning("email unique index skipped: %s", type(exc).__name__)
        return "error"


def backfill_token_versions() -> int:
    from pymongo import MongoClient
    with MongoClient(mongo_url) as client:
        result = client[db.name].users.update_many(
            {"$or": [{"token_version": {"$exists": False}}, {"token_version": None}]},
            {"$set": {"token_version": 0}},
        )
        return result.modified_count


def _drop_unique_user_push_index(sync) -> None:
    """The old unique user_id index rejects a second device. Drop only that unique index."""
    try:
        info = sync.push_subscriptions.index_information()
    except Exception as exc:
        logger.warning("push index lookup skipped: %s", type(exc).__name__)
        return
    for name, spec in info.items():
        if spec.get("unique") and list(spec.get("key") or []) == [("user_id", 1)]:
            sync.push_subscriptions.drop_index(name)


def dedupe_push_subscriptions() -> int:
    """Keep one row per endpoint. Different devices of the same user stay."""
    removed = 0
    from pymongo import MongoClient
    with MongoClient(mongo_url) as client:
        sync = client[db.name]
        _drop_unique_user_push_index(sync)
        pipeline = [
            {"$match": {"endpoint": {"$type": "string"}}},
            {"$group": {"_id": "$endpoint", "count": {"$sum": 1}}},
            {"$match": {"count": {"$gt": 1}, "_id": {"$nin": [None, ""]}}},
        ]
        for group in sync.push_subscriptions.aggregate(pipeline):
            docs = list(
                sync.push_subscriptions.find({"endpoint": group["_id"]}).sort(
                    [("updated_at", -1), ("created_at", -1)]
                )
            )
            extras = [doc["_id"] for doc in docs[1:]]
            if extras:
                result = sync.push_subscriptions.delete_many({"_id": {"$in": extras}})
                removed += result.deleted_count
    return removed


def normalize_stored_emails() -> dict:
    """Lowercase stored emails. Colliding accounts are reported and left unchanged."""
    grouped = {}
    from pymongo import MongoClient
    with MongoClient(mongo_url) as client:
        sync = client[db.name]
        return _normalize_stored_emails(sync, grouped)


def _normalize_stored_emails(sync, grouped) -> dict:
    for user in sync.users.find({"email": {"$type": "string"}}, {"user_id": 1, "email": 1}):
        key = normalize_email(user.get("email") or "")
        if not key:
            continue
        grouped.setdefault(key, []).append(user)
    updated = 0
    collisions = 0
    for key, rows in grouped.items():
        user_ids = sorted({row.get("user_id") for row in rows})
        if len(user_ids) > 1:
            collisions += 1
            logger.warning("email collision left unchanged user_ids=%s", user_ids)
            continue
        row = rows[0]
        if row.get("email") == key:
            continue
        sync.users.update_one({"user_id": row["user_id"]}, {"$set": {"email": key}})
        sync.password_resets.update_many({"email": row["email"]}, {"$set": {"email": key}})
        sync.email_verifications.update_many({"email": row["email"]}, {"$set": {"email": key}})
        updated += 1
    return {"updated": updated, "collisions": collisions}


async def create_db_indexes():
    """
    Create MongoDB indexes on startup.
    A failure on one index does not skip the others.
    """
    _warn_email_from_missing()
    try:
        await asyncio.to_thread(backfill_token_versions)
    except Exception as exc:
        logger.warning("token_version backfill skipped: %s", type(exc).__name__)
    try:
        removed = await asyncio.to_thread(dedupe_push_subscriptions)
        if removed:
            logger.info("removed %s duplicate push subscription rows", removed)
    except Exception as exc:
        logger.warning("push subscription dedupe skipped: %s", type(exc).__name__)
    try:
        activity = await asyncio.to_thread(backfill_last_message_activity)
        if activity:
            logger.info("conversation activity backfill updated=%s", activity)
    except Exception as exc:
        logger.warning("conversation activity backfill skipped: %s", type(exc).__name__)
    try:
        email_result = await asyncio.to_thread(normalize_stored_emails)
        if email_result["collisions"] or email_result["updated"]:
            logger.info(
                "email normalize updated=%s collisions=%s",
                email_result["updated"],
                email_result["collisions"],
            )
    except Exception as exc:
        logger.warning("email normalize skipped: %s", type(exc).__name__)

    await _safe_index("stored_files.file_id", db.stored_files.create_index("file_id", unique=True, background=True))
    await _safe_index(
        "stored_files.uploader_created",
        db.stored_files.create_index([("uploader_id", 1), ("created_at", 1)], background=True),
    )
    try:
        rows = await db.stored_files.aggregate([
            {"$group": {"_id": None, "total": {"$sum": "$size"}, "count": {"$sum": 1}}},
        ]).to_list(1)
        total = int(rows[0]["total"]) if rows else 0
        count = int(rows[0]["count"]) if rows else 0
        logger.info("stored uploads count=%s bytes=%s", count, total)
    except Exception as exc:
        logger.warning("stored upload size log skipped: %s", type(exc).__name__)
    await _safe_index("users.user_id", db.users.create_index("user_id", unique=True, background=True))
    try:
        email_index = await asyncio.to_thread(ensure_unique_email_index)
        if email_index != "exists":
            logger.info("email unique index %s", email_index)
    except Exception as exc:
        logger.warning("email unique index skipped: %s", type(exc).__name__)
    await _safe_index("users.phone_number", db.users.create_index("phone_number", sparse=True, background=True))
    await _safe_index("conversations.conversation_id", db.conversations.create_index("conversation_id", unique=True, background=True))
    await _safe_index("conversations.participant_ids", db.conversations.create_index("participant_ids", background=True))
    await _safe_index("messages.message_id", db.messages.create_index("message_id", unique=True, background=True))
    await _safe_index(
        "messages.conversation_created",
        db.messages.create_index([("conversation_id", 1), ("created_at", -1)], background=True),
    )
    await _safe_index(
        "messages.conversation_created_id",
        db.messages.create_index(
            [("conversation_id", 1), ("created_at", -1), ("_id", -1)],
            background=True,
        ),
    )
    await _safe_index(
        "messages.conversation_sender",
        db.messages.create_index([("conversation_id", 1), ("sender_id", 1)], background=True),
    )
    await _safe_index(
        "conversations.participant_activity",
        db.conversations.create_index(
            [("participant_ids", 1), ("last_message_at", -1), ("_id", -1)],
            background=True,
        ),
    )
    await _safe_index(
        "messages.text",
        db.messages.create_index([("content", "text"), ("sender_name", "text")], background=True),
    )
    await _safe_index(
        "typing.conversation_user",
        db.typing_status.create_index([("conversation_id", 1), ("user_id", 1)], unique=True, background=True),
    )
    await _safe_index(
        "typing.timestamp",
        db.typing_status.create_index("timestamp", expireAfterSeconds=10, background=True),
    )
    await _safe_index("calls.call_id", db.calls.create_index("call_id", unique=True, background=True))
    await _safe_index("calls.conversation_id", db.calls.create_index("conversation_id", background=True))
    await _safe_index("notifications.user_id", db.notifications.create_index("user_id", background=True))
    await _safe_index("notifications.created_at", db.notifications.create_index("created_at", background=True))
    await _safe_index(
        "push_subscriptions.user_id",
        db.push_subscriptions.create_index("user_id", background=True),
    )
    await _safe_index(
        "push_subscriptions.endpoint",
        db.push_subscriptions.create_index(
            "endpoint",
            unique=True,
            partialFilterExpression={"endpoint": {"$type": "string"}},
            background=True,
        ),
    )
    await _safe_index(
        "user_sessions.session_token",
        db.user_sessions.create_index("session_token", unique=True, background=True),
    )
    await _safe_index("user_sessions.user_id", db.user_sessions.create_index("user_id", background=True))
    await _safe_index("password_resets.token", db.password_resets.create_index("token", unique=True, background=True))
    await _safe_index("password_resets.email", db.password_resets.create_index("email", background=True))
    await _safe_index("statuses.user_id", db.statuses.create_index("user_id", background=True))
    await _safe_index(
        "statuses.created_at",
        db.statuses.create_index("created_at", expireAfterSeconds=86400, background=True),
    )
    await _safe_index("invite_links.user_id", db.invite_links.create_index("user_id", unique=True, background=True))
    await _safe_index("invite_links.invite_code", db.invite_links.create_index("invite_code", unique=True, background=True))
    logger.info("MongoDB index setup finished")
