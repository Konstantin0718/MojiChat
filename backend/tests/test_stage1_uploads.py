"""Auth, type checks, and signed access for stored uploads."""
import asyncio
import os
import struct
import uuid

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "mojichat_upload_tests")
os.environ.setdefault("JWT_SECRET", "ci_test_secret_long_enough_value")

_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)

import pytest
from fastapi.testclient import TestClient

import file_storage
import server

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
)


def _wav() -> bytes:
    payload = b"\x00\x00" * 8
    return (
        b"RIFF"
        + struct.pack("<I", 36 + len(payload))
        + b"WAVEfmt "
        + struct.pack("<IHHIIHH", 16, 1, 1, 8000, 16000, 2, 16)
        + b"data"
        + struct.pack("<I", len(payload))
        + payload
    )


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as test_client:
        yield test_client


def _register(client, name="Upload"):
    response = client.post(
        "/api/auth/register",
        json={
            "email": f"up-{uuid.uuid4().hex[:8]}@example.com",
            "password": "Test1234!",
            "name": name,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def _auth(user):
    return {"Authorization": f"Bearer {user['token']}"}


def _conversation(client, owner, friend):
    created = client.post(
        "/api/conversations",
        headers=_auth(owner),
        json={"participant_ids": [friend["user_id"]]},
    )
    assert created.status_code == 200, created.text
    return created.json()["conversation_id"]


def _file_id(url: str) -> str:
    return url.split("?", 1)[0].rsplit("/", 1)[-1]


def test_upload_and_fetch_require_auth(client):
    assert client.post("/api/upload", files={"file": ("a.png", PNG, "image/png")}).status_code == 401
    assert client.get("/api/files/abcdef0123456789abcdef0123456789").status_code == 401
    assert client.get("/uploads/a.png").status_code == 404


def test_magic_bytes_reject_html_disguised_as_png(client):
    user = _register(client)
    response = client.post(
        "/api/upload",
        headers=_auth(user),
        files={"file": ("photo.png", b"<html><script>alert(1)</script></html>", "image/png")},
    )
    assert response.status_code == 400
    assert b"<html>" not in response.content
    assert "photo.png" not in response.text


def test_oversize_image_is_rejected(client, monkeypatch):
    monkeypatch.setenv("UPLOAD_MAX_IMAGE_BYTES", "8")
    user = _register(client)
    response = client.post(
        "/api/upload",
        headers=_auth(user),
        files={"file": ("a.png", PNG, "application/octet-stream")},
    )
    assert response.status_code == 413


def test_participant_signed_url_and_disposition(client):
    owner = _register(client, "Owner")
    friend = _register(client, "Friend")
    stranger = _register(client, "Stranger")
    conversation_id = _conversation(client, owner, friend)

    uploaded = client.post(
        "/api/upload",
        headers=_auth(owner),
        files={"file": ("a.png", PNG, "text/plain")},
    )
    assert uploaded.status_code == 200, uploaded.text
    body = uploaded.json()
    assert body["mime_type"] == "image/png"
    assert body["file_name"] == "a.png"
    assert "sig=" in body["file_url"]
    file_id = body["file_id"]
    assert len(file_id) == 32

    sent = client.post(
        f"/api/conversations/{conversation_id}/messages",
        headers=_auth(owner),
        json={"content": "", "message_type": "image", "file_url": body["file_url"], "file_name": body["file_name"]},
    )
    assert sent.status_code == 200, sent.text
    assert sent.json()["file_url"].startswith(f"/api/files/{file_id}?")
    assert f"uid={owner['user_id']}" in sent.json()["file_url"]

    messages = client.get(
        f"/api/conversations/{conversation_id}/messages",
        headers=_auth(friend),
    )
    assert messages.status_code == 200, messages.text
    friend_url = messages.json()[-1]["file_url"]
    assert f"uid={friend['user_id']}" in friend_url
    assert "sig=" in friend_url

    fetched = client.get(friend_url)
    assert fetched.status_code == 200, fetched.text
    assert fetched.content == PNG
    assert fetched.headers["content-type"].startswith("image/png")
    assert fetched.headers["x-content-type-options"] == "nosniff"
    assert fetched.headers["content-disposition"].startswith("inline;")

    hidden = client.get(f"/api/files/{file_id}", headers=_auth(stranger))
    assert hidden.status_code == 404
    stranger_url = file_storage.sign_file_url(file_id, stranger["user_id"])
    assert client.get(stranger_url).status_code == 404

    expired = file_storage.sign_file_url(file_id, friend["user_id"], ttl_seconds=-30)
    assert client.get(expired).status_code == 401

    missing = client.get("/api/files/voice_deadbeef.webm", headers=_auth(owner))
    assert missing.status_code == 404

    notes = client.post(
        "/api/upload",
        headers=_auth(owner),
        files={"file": (".. /notes.txt", b"hello notes\n", "image/png")},
    )
    assert notes.status_code == 200, notes.text
    note_id = notes.json()["file_id"]
    note = client.get(f"/api/files/{note_id}", headers=_auth(owner))
    assert note.status_code == 200
    assert note.headers["content-type"].startswith("text/plain")
    assert note.headers["content-disposition"].startswith("attachment;")
    assert "notes.txt" in note.headers["content-disposition"]
    assert ".." not in note.headers["content-disposition"]


def test_avatar_is_readable_by_any_signed_in_user(client):
    owner = _register(client)
    other = _register(client)
    updated = client.put(
        "/api/users/profile",
        headers=_auth(owner),
        files={"file": ("me.png", PNG, "application/octet-stream")},
        data={"name": "Owner"},
    )
    assert updated.status_code == 200, updated.text
    picture = updated.json()["picture"]
    assert picture.startswith("/api/files/")
    seen = client.get(picture)
    assert seen.status_code == 200
    assert seen.content == PNG
    file_id = _file_id(picture)
    assert client.get(f"/api/files/{file_id}", headers=_auth(other)).status_code == 200
    assert client.get(f"/api/files/{file_id}").status_code == 401


def test_voice_upload_uses_detected_audio(client):
    user = _register(client)
    response = client.post(
        "/api/voice/upload",
        headers=_auth(user),
        json={"audio_data": __import__("base64").b64encode(_wav()).decode(), "duration": 1},
    )
    assert response.status_code == 200, response.text
    fetched = client.get(response.json()["file_url"])
    assert fetched.status_code == 200
    assert fetched.headers["content-type"].startswith("audio/wav")
    assert fetched.headers["content-disposition"].startswith("inline;")


def test_empty_text_message_is_rejected(client):
    owner = _register(client)
    friend = _register(client)
    conversation_id = _conversation(client, owner, friend)
    blank = client.post(
        f"/api/conversations/{conversation_id}/messages",
        headers=_auth(owner),
        json={"content": "   ", "message_type": "text"},
    )
    assert blank.status_code == 422
    assert blank.json()["detail"] == "Message is empty"
    missing = client.post(
        f"/api/conversations/{conversation_id}/messages",
        headers=_auth(owner),
        json={"message_type": "text"},
    )
    assert missing.status_code == 422
    assert missing.json()["detail"] == "Message is empty"
