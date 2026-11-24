"""Bearer-only auth, CORS origins, and token_version revocation."""
import asyncio
import os
import uuid
from datetime import datetime, timedelta, timezone

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "mojichat_session_tests")
os.environ.setdefault("JWT_SECRET", "ci_test_secret_long_enough_value")

_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)

import jwt
import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient
from starlette.websockets import WebSocketDisconnect

import server


def _run(coro):
    return _LOOP.run_until_complete(coro)


def _db():
    return MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as test_client:
        yield test_client


def _register(client):
    email = f"session-{uuid.uuid4().hex[:8]}@example.com"
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "Test1234!", "name": "Session"},
    )
    assert response.status_code == 200, response.text
    return response


def test_auth_is_bearer_only(client):
    created = _register(client)
    assert "session_token" not in created.cookies
    token = created.json()["token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    cookie_only = client.get("/api/auth/me", cookies={"session_token": token})
    assert cookie_only.status_code == 401


def test_cors_ignores_wildcard_and_adds_localhost_only_with_the_flag(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    monkeypatch.delenv("CORS_ALLOW_DEV_ORIGINS", raising=False)
    assert server.configured_cors_origins() == ["https://moji-chat-gamma.vercel.app"]

    monkeypatch.setenv("CORS_ORIGINS", "*")
    assert server.configured_cors_origins() == ["https://moji-chat-gamma.vercel.app"]

    monkeypatch.setenv("CORS_ORIGINS", "https://example.com, *")
    monkeypatch.setenv("CORS_ALLOW_DEV_ORIGINS", "true")
    origins = server.configured_cors_origins()
    assert origins[0] == "https://example.com"
    assert "http://localhost:3000" in origins
    assert "http://127.0.0.1:3000" in origins
    assert "*" not in origins


def test_tokens_carry_version_and_missing_claim_means_zero(client):
    created = _register(client)
    body = created.json()
    payload = jwt.decode(body["token"], os.environ["JWT_SECRET"], algorithms=["HS256"])
    assert payload["token_version"] == 0
    legacy = jwt.encode(
        {
            "user_id": body["user_id"],
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
        os.environ["JWT_SECRET"],
        algorithm="HS256",
    )
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {legacy}"})
    assert me.status_code == 200, me.text


def test_logout_all_and_reset_revoke_old_tokens(client, monkeypatch):
    created = _register(client)
    body = created.json()
    headers = {"Authorization": f"Bearer {body['token']}"}
    revoked = client.post("/api/auth/logout-all", headers=headers)
    assert revoked.status_code == 200, revoked.text
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    logged_in = client.post(
        "/api/auth/login",
        json={"email": body["email"], "password": "Test1234!"},
    )
    assert logged_in.status_code == 200, logged_in.text
    current = logged_in.json()["token"]
    raw = "reset-session-token"
    monkeypatch.setattr(server, "_new_reset_token", lambda: raw)
    _db().password_resets.delete_many({"token": server.hash_reset_token(raw)})
    forgot = client.post("/api/auth/forgot-password", json={"email": body["email"]})
    assert forgot.status_code == 200, forgot.text
    reset = client.post(
        "/api/auth/reset-password",
        json={"token": raw, "new_password": "Newpass1!"},
    )
    assert reset.status_code == 200, reset.text
    assert client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {current}"},
    ).status_code == 401
    again = client.post(
        "/api/auth/login",
        json={"email": body["email"], "password": "Newpass1!"},
    )
    assert again.status_code == 200, again.text


def test_websocket_rejects_a_revoked_token(client):
    created = _register(client)
    body = created.json()
    with client.websocket_connect(f"/ws/{body['user_id']}?token={body['token']}") as socket:
        socket.send_json({"type": "ping"})
        assert socket.receive_json()["type"] == "pong"
    client.post("/api/auth/logout-all", headers={"Authorization": f"Bearer {body['token']}"})
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/{body['user_id']}?token={body['token']}") as socket:
            socket.receive_json()


def test_startup_backfill_sets_missing_token_version():
    user_id = f"user_{uuid.uuid4().hex[:8]}"
    _db().users.insert_one({"user_id": user_id, "email": f"{user_id}@example.com", "name": "Old"})
    server.backfill_token_versions()
    stored = _db().users.find_one({"user_id": user_id})
    assert stored["token_version"] == 0
