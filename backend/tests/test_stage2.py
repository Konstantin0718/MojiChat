"""Atomic reactions and capped voice bodies."""
import asyncio
import base64
import os
import uuid

from pymongo import MongoClient

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "mojichat_stage2_tests")
os.environ.setdefault("JWT_SECRET", "ci_test_secret_long_enough_value")

_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)

import pytest
from fastapi.testclient import TestClient

import server


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as test_client:
        yield test_client


def _register(client):
    response = client.post(
        "/api/auth/register",
        json={
            "email": f"s2-{uuid.uuid4().hex[:8]}@example.com",
            "password": "Test1234!",
            "name": "Stage",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def _auth(user):
    return {"Authorization": f"Bearer {user['token']}"}


def _message(client, owner, friend):
    created = client.post(
        "/api/conversations",
        headers=_auth(owner),
        json={"participant_ids": [friend["user_id"]]},
    )
    assert created.status_code == 200, created.text
    sent = client.post(
        f"/api/conversations/{created.json()['conversation_id']}/messages",
        headers=_auth(owner),
        json={"content": "hello", "message_type": "text"},
    )
    assert sent.status_code == 200, sent.text
    return sent.json()["message_id"]


def test_giphy_file_url_is_stored_and_other_hosts_are_rejected(client):
    owner = _register(client)
    friend = _register(client)
    created = client.post(
        "/api/conversations",
        headers=_auth(owner),
        json={"participant_ids": [friend["user_id"]]},
    )
    assert created.status_code == 200, created.text
    conversation_id = created.json()["conversation_id"]
    headers = _auth(owner)
    giphy = "https://media.giphy.com/media/abc/giphy.gif"
    sent = client.post(
        f"/api/conversations/{conversation_id}/messages",
        headers=headers,
        json={"content": "GIF", "message_type": "gif", "file_url": giphy},
    )
    assert sent.status_code == 200, sent.text
    assert sent.json()["file_url"] == giphy
    rejected = client.post(
        f"/api/conversations/{conversation_id}/messages",
        headers=headers,
        json={"content": "GIF", "message_type": "gif", "file_url": "https://attacker.example/pixel.gif"},
    )
    assert rejected.status_code == 422
    status_ok = client.post(
        "/api/statuses",
        headers=headers,
        json={"content_type": "image", "file_url": "https://i.giphy.com/media/x.gif"},
    )
    assert status_ok.status_code == 200, status_ok.text
    status_bad = client.post(
        "/api/statuses",
        headers=headers,
        json={"content_type": "image", "file_url": "https://attacker.example/pixel.gif"},
    )
    assert status_bad.status_code == 422


def test_reactions_are_atomic_and_reject_bad_keys(client):
    owner = _register(client)
    friend = _register(client)
    message_id = _message(client, owner, friend)
    headers = _auth(friend)
    first = client.post(
        f"/api/messages/{message_id}/reactions",
        headers=headers,
        json={"emoji": "👍"},
    )
    second = client.post(
        f"/api/messages/{message_id}/reactions",
        headers=headers,
        json={"emoji": "👍"},
    )
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()["reactions"]["👍"] == [friend["user_id"]]
    assert second.json()["reactions"]["👍"] == [friend["user_id"]]
    rejected = client.post(
        f"/api/messages/{message_id}/reactions",
        headers=headers,
        json={"emoji": "$set"},
    )
    assert rejected.status_code == 422
    dotted = client.post(
        f"/api/messages/{message_id}/reactions",
        headers=headers,
        json={"emoji": "a.b"},
    )
    assert dotted.status_code == 422
    removed = client.delete(
        f"/api/messages/{message_id}/reactions/%F0%9F%91%8D",
        headers=headers,
    )
    assert removed.status_code == 200, removed.text
    assert "👍" not in removed.json()["reactions"]
    heart = "\u2764\ufe0f"
    loved = client.post(
        f"/api/messages/{message_id}/reactions",
        headers=headers,
        json={"emoji": heart},
    )
    assert loved.status_code == 200, loved.text
    assert heart in loved.json()["reactions"]


class _StreamRequest:
    def __init__(self, chunks, content_length=None):
        self.headers = {}
        if content_length is not None:
            self.headers["content-length"] = content_length
        self._chunks = chunks

    async def body(self):
        return b"".join(self._chunks)

    async def stream(self):
        for chunk in self._chunks:
            yield chunk


def test_android_m4a_voice_is_stored_as_audio(client):
    user = _register(client)
    payload = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 24
    response = client.post(
        "/api/voice/upload",
        headers=_auth(user),
        json={"audio_data": base64.b64encode(payload).decode(), "duration": 1},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["file_url"].startswith("/api/files/")
    with MongoClient(os.environ["MONGO_URL"]) as mongo:
        stored = mongo[os.environ["DB_NAME"]].stored_files.find_one({"file_id": body["file_id"]})
        assert stored is not None
        assert stored["media_class"] == "audio"
        assert stored["content_type"] == "audio/mp4"
        assert mongo[os.environ["DB_NAME"]]["uploads.files"].find_one({"_id": stored["gridfs_id"]})


def test_default_media_cap_is_40mb(monkeypatch):
    monkeypatch.delenv("UPLOAD_MAX_MEDIA_BYTES", raising=False)
    from file_storage import max_bytes_for

    assert max_bytes_for("video") == 40 * 1024 * 1024
    assert max_bytes_for("audio") == 40 * 1024 * 1024


def test_phone_video_containers_are_accepted():
    from file_storage import detect_upload

    hevc = b"\x00\x00\x00\x18ftyphvc1" + b"\x00" * 24
    phone = b"\x00\x00\x00\x18ftyp3gp4" + b"\x00" * 24
    assert detect_upload(hevc) == ("video/mp4", "video")
    assert detect_upload(phone) == ("video/3gpp", "video")


def test_voice_body_without_content_length_stops_at_the_cap():
    small = _StreamRequest([b'{"audio_data":"aa"}'])
    body = _LOOP.run_until_complete(server._read_capped_body(small, 100))
    assert body == b'{"audio_data":"aa"}'
    huge = _StreamRequest([b"x" * 6, b"yyyy"])
    with pytest.raises(server.HTTPException) as raised:
        _LOOP.run_until_complete(server._read_capped_body(huge, 8))
    assert raised.value.status_code == 413
