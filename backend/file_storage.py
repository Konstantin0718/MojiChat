"""Stored uploads.

GridFS in the existing Mongo database is the default. FILE_STORAGE=s3 or
FILE_STORAGE=r2 selects the object-storage seam; that backend is not wired
up because this repo has no bucket credentials.
"""
import hashlib
import hmac
import io
import os
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote

import filetype
from motor.motor_asyncio import AsyncIOMotorGridFSBucket

FILE_ID_RE = re.compile(r"^[a-f0-9]{32}$")

# Content types we will store and serve. The value is the media class used
# for the size cap and Content-Disposition.
ALLOWED_TYPES = {
    "image/jpeg": "image",
    "image/png": "image",
    "image/gif": "image",
    "image/webp": "image",
    "image/heic": "image",
    "image/heif": "image",
    "video/mp4": "video",
    "video/3gpp": "video",
    "video/webm": "video",
    "audio/mpeg": "audio",
    "audio/mp4": "audio",
    "audio/x-m4a": "audio",
    "audio/aac": "audio",
    "audio/ogg": "audio",
    "audio/opus": "audio",
    "audio/wav": "audio",
    "audio/x-wav": "audio",
    "audio/webm": "audio",
    "audio/3gpp": "audio",
    "application/pdf": "file",
    "text/plain": "file",
    "application/zip": "file",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "file",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "file",
}

_SERVE_AS = {
    "audio/x-wav": "audio/wav",
    "audio/x-m4a": "audio/mp4",
}


def _positive_int_env(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def max_bytes_for(media_class: str) -> int:
    if media_class == "image":
        return _positive_int_env("UPLOAD_MAX_IMAGE_BYTES", 10 * 1024 * 1024)
    if media_class in ("audio", "video"):
        return _positive_int_env("UPLOAD_MAX_MEDIA_BYTES", 25 * 1024 * 1024)
    return _positive_int_env("UPLOAD_MAX_FILE_BYTES", 15 * 1024 * 1024)


def upload_byte_ceiling() -> int:
    return max(max_bytes_for("image"), max_bytes_for("audio"), max_bytes_for("file"))


def upload_daily_bytes() -> int:
    return _positive_int_env("UPLOAD_DAILY_BYTES", 100 * 1024 * 1024)


def file_url_window() -> int:
    """URLs stay the same inside one window and remain valid for one to two windows."""
    return _positive_int_env("FILE_URL_WINDOW_SECONDS", 3600)


def sanitize_filename(name: Optional[str]) -> str:
    raw = (name or "file").replace("\\", "/").split("/")[-1]
    cleaned = re.sub(r"[^A-Za-z0-9._ -]", "", raw).strip().strip(".")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return (cleaned or "file")[:120]


def _is_plain_text(data: bytes) -> bool:
    if not data or b"\x00" in data or len(data) > max_bytes_for("file"):
        return False
    sample = data[:4096]
    try:
        text = sample.decode("utf-8")
    except UnicodeDecodeError:
        return False
    head = text.lstrip().lower()[:240]
    if head.startswith(("<!doctype", "<html", "<script", "<svg", "<?php", "<?xml")):
        return False
    if "<script" in head or "<html" in head or "<svg" in head:
        return False
    printable = sum(1 for ch in text if ch.isprintable() or ch in "\r\n\t")
    return printable / max(len(text), 1) >= 0.95


def _manual_mime(data: bytes) -> Optional[str]:
    if data.startswith(b"\x1a\x45\xdf\xa3") and b"webm" in data[:4096]:
        return "video/webm"
    head = data[:64]
    if b"ftypheic" in head or b"ftypheif" in head or b"ftypmif1" in head or b"ftypheix" in head:
        return "image/heic"
    if b"ftyp" in head[:32]:
        brand = head[head.find(b"ftyp") + 4:head.find(b"ftyp") + 8]
        if brand in (b"M4A ", b"M4A\x00", b"m4a "):
            return "audio/mp4"
        if brand in (b"isom", b"mp41", b"mp42", b"avc1", b"avc3", b"hvc1", b"hev1", b"dash", b"iso2", b"mp4v"):
            return "video/mp4"
        if brand in (b"3gp4", b"3gp5", b"3gp6", b"3gp7"):
            return "video/3gpp"
    return None


def detect_upload(data: bytes):
    """Return (content_type, media_class) from the bytes, or None."""
    if not data:
        return None
    guessed = filetype.guess(data)
    mime = guessed.mime if guessed else None
    if mime is None:
        mime = _manual_mime(data)
    if mime is None and _is_plain_text(data):
        mime = "text/plain"
    if mime == "audio/x-wav":
        mime = "audio/wav"
    media_class = ALLOWED_TYPES.get(mime or "")
    if not media_class:
        return None
    return _SERVE_AS.get(mime, mime), media_class


def parse_file_id(url: Optional[str]) -> Optional[str]:
    if not url or not isinstance(url, str):
        return None
    path = url.split("?", 1)[0]
    marker = "/api/files/"
    if marker not in path:
        return None
    file_id = path.split(marker, 1)[1].strip("/")
    if "/" in file_id or not FILE_ID_RE.fullmatch(file_id):
        return None
    return file_id


def _signing_key() -> bytes:
    secret = os.environ.get("JWT_SECRET") or ""
    return hashlib.sha256(b"mojichat-file-v1:" + secret.encode()).digest()


def _signature(file_id: str, user_id: str, exp: int) -> str:
    message = f"{file_id}.{user_id}.{exp}".encode()
    return hmac.new(_signing_key(), message, hashlib.sha256).hexdigest()


def sign_file_url(file_id: str, user_id: str, now: Optional[float] = None) -> str:
    window = file_url_window()
    current = int(time.time() if now is None else now)
    exp = (current // window + 2) * window
    sig = _signature(file_id, user_id, exp)
    uid = quote(str(user_id), safe="")
    return f"/api/files/{file_id}?uid={uid}&exp={exp}&sig={sig}"


def parse_byte_range(header: Optional[str], size: int):
    """Return (start, end) inclusive, None when there is no header, or 'invalid'."""
    if not header:
        return None
    value = header.strip()
    if not value.lower().startswith("bytes="):
        return "invalid"
    spec = value[6:].split(",", 1)[0].strip()
    if "-" not in spec or size <= 0:
        return "invalid"
    start_s, end_s = spec.split("-", 1)
    try:
        if start_s == "":
            count = int(end_s)
            if count <= 0:
                return "invalid"
            start = max(size - count, 0)
            end = size - 1
        else:
            start = int(start_s)
            end = int(end_s) if end_s else size - 1
    except ValueError:
        return "invalid"
    if start < 0 or start >= size or end < start:
        return "invalid"
    return start, min(end, size - 1)


def verify_file_signature(file_id: str, user_id: str, exp, sig: str) -> bool:
    try:
        exp_i = int(exp)
    except (TypeError, ValueError):
        return False
    if exp_i < int(time.time()):
        return False
    expected = _signature(file_id, str(user_id), exp_i)
    if not isinstance(sig, str) or len(sig) != len(expected):
        return False
    return hmac.compare_digest(expected, sig)


def present_file_url(url, user_id: Optional[str]):
    """Sign our own file URLs. Leave external and legacy URLs unchanged."""
    if not url or not user_id:
        return url
    file_id = parse_file_id(url)
    if not file_id:
        return url
    return sign_file_url(file_id, user_id)


def content_disposition(media_class: str, original_name: str) -> str:
    kind = "inline" if media_class in ("image", "audio", "video") else "attachment"
    safe = sanitize_filename(original_name).replace('"', "")
    return f'{kind}; filename="{safe}"'


class FileStore:
    async def save(self, **kwargs) -> dict:
        raise NotImplementedError

    async def get_meta(self, file_id: str):
        raise NotImplementedError

    async def read(self, meta: dict, start: int = 0, end: Optional[int] = None) -> bytes:
        raise NotImplementedError

    async def link(self, file_id: str, *, conversation_id: Optional[str] = None, kind: Optional[str] = None):
        raise NotImplementedError

    async def pull_conversation(self, file_id: str, conversation_id: str):
        raise NotImplementedError

    async def delete(self, file_id: str):
        raise NotImplementedError


class GridFSFileStore(FileStore):
    def __init__(self, database):
        self.db = database
        self._bucket = None

    @property
    def bucket(self):
        # Create it on first use so it binds to the running event loop.
        if self._bucket is None:
            self._bucket = AsyncIOMotorGridFSBucket(self.db, bucket_name="uploads")
        return self._bucket

    async def save(self, **kwargs) -> dict:
        file_id = uuid.uuid4().hex
        data = kwargs["data"]
        gridfs_id = await self.bucket.upload_from_stream(
            file_id,
            io.BytesIO(data),
            metadata={"file_id": file_id, "content_type": kwargs["content_type"]},
        )
        doc = {
            "file_id": file_id,
            "gridfs_id": gridfs_id,
            "content_type": kwargs["content_type"],
            "media_class": kwargs["media_class"],
            "original_name": kwargs["original_name"],
            "size": len(data),
            "uploader_id": kwargs["uploader_id"],
            "kind": kwargs.get("kind") or "upload",
            "conversation_ids": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await self.db.stored_files.insert_one(doc)
        stored = dict(doc)
        stored.pop("_id", None)
        return stored

    async def get_meta(self, file_id: str):
        if not FILE_ID_RE.fullmatch(file_id or ""):
            return None
        return await self.db.stored_files.find_one({"file_id": file_id}, {"_id": 0})

    async def read(self, meta: dict, start: int = 0, end: Optional[int] = None) -> bytes:
        stream = await self.bucket.open_download_stream(meta["gridfs_id"])
        if start:
            stream.seek(start)
        if end is None:
            return await stream.read()
        return await stream.read(end - start + 1)

    async def link(self, file_id: str, *, conversation_id: Optional[str] = None, kind: Optional[str] = None):
        update = {}
        if conversation_id:
            update["$addToSet"] = {"conversation_ids": conversation_id}
        if kind:
            update["$set"] = {"kind": kind}
        if update:
            await self.db.stored_files.update_one({"file_id": file_id}, update)

    async def pull_conversation(self, file_id: str, conversation_id: str):
        await self.db.stored_files.update_one(
            {"file_id": file_id},
            {"$pull": {"conversation_ids": conversation_id}},
        )

    async def delete(self, file_id: str):
        meta = await self.get_meta(file_id)
        if not meta:
            return
        await self.bucket.delete(meta["gridfs_id"])
        await self.db.stored_files.delete_one({"file_id": file_id})


class ObjectFileStore(FileStore):
    """Seam for R2 or S3. Not used until a bucket is configured and this is implemented."""

    def __init__(self):
        self.bucket = (os.environ.get("S3_BUCKET") or os.environ.get("R2_BUCKET") or "").strip()
        self.endpoint = (os.environ.get("S3_ENDPOINT_URL") or os.environ.get("R2_ENDPOINT_URL") or "").strip()

    def _refuse(self):
        raise RuntimeError("FILE_STORAGE is set to object storage, but no bucket backend is implemented")

    async def save(self, **kwargs) -> dict:
        self._refuse()

    async def get_meta(self, file_id: str):
        self._refuse()

    async def read(self, meta: dict, start: int = 0, end: Optional[int] = None) -> bytes:
        self._refuse()

    async def link(self, file_id: str, *, conversation_id: Optional[str] = None, kind: Optional[str] = None):
        self._refuse()

    async def pull_conversation(self, file_id: str, conversation_id: str):
        self._refuse()

    async def delete(self, file_id: str):
        self._refuse()


def build_file_store(database) -> FileStore:
    kind = (os.environ.get("FILE_STORAGE") or "gridfs").strip().lower()
    if kind in ("", "gridfs", "mongodb"):
        return GridFSFileStore(database)
    if kind in ("s3", "r2"):
        return ObjectFileStore()
    raise RuntimeError("FILE_STORAGE must be gridfs, s3, or r2")
