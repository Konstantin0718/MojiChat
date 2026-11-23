"""Google ID-token login. The verifier is mocked, so these tests never call Google."""
import asyncio
import logging
import os
import uuid

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "mojichat_google_tests")
os.environ.setdefault("JWT_SECRET", "ci_test_secret_long_enough_value")
os.environ["GOOGLE_CLIENT_ID"] = ""

_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)

import jwt
import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient

import server
from server import _rate_state


def _users():
    client = MongoClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]].users


@pytest.fixture(autouse=True)
def _clear_google_limits():
    _rate_state.clear()
    yield
    _rate_state.clear()


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as test_client:
        yield test_client


def _claims(**overrides):
    claims = {
        "sub": "google-sub-1",
        "email": "ada@example.com",
        "email_verified": True,
        "name": "Ada Lovelace",
        "picture": "https://example.com/ada.png",
    }
    claims.update(overrides)
    return claims


def _stub_verifier(monkeypatch, claims=None, error=None):
    seen = {}

    def fake(credential, client_id):
        seen["credential"] = credential
        seen["client_id"] = client_id
        if error:
            raise error
        return claims

    monkeypatch.setattr(server, "verify_google_id_token", fake)
    return seen


def test_google_disabled_keeps_email_login(client, monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    email = f"mail-{uuid.uuid4().hex[:8]}@example.com"
    registered = client.post(
        "/api/auth/register",
        json={"email": email, "password": "Test1234!", "name": "Mail User"},
    )
    assert registered.status_code == 200, registered.text

    google = client.post("/api/auth/google", json={"credential": "unused-token"})
    assert google.status_code == 503
    assert google.json()["detail"] == "Google sign-in is not configured"
    assert "unused-token" not in google.text

    logged_in = client.post(
        "/api/auth/login",
        json={"email": email, "password": "Test1234!"},
    )
    assert logged_in.status_code == 200, logged_in.text
    assert logged_in.json()["user_id"] == registered.json()["user_id"]


def test_rejects_bad_token_without_logging_it(client, monkeypatch, caplog):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "web-client.apps.googleusercontent.com")
    secret = "raw-id-token-must-not-appear-in-logs"
    _stub_verifier(monkeypatch, error=ValueError("bad signature"))
    caplog.set_level(logging.INFO, logger="server")

    response = client.post("/api/auth/google", json={"credential": secret})

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid Google credential"
    assert secret not in response.text
    messages = "\n".join(record.getMessage() for record in caplog.records)
    assert "ValueError" in messages
    assert secret not in messages


def test_rejects_unverified_email(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "web-client.apps.googleusercontent.com")
    _stub_verifier(monkeypatch, claims=_claims(email_verified=False))
    response = client.post("/api/auth/google", json={"credential": "verified-looking"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Google account email is not verified"


def test_new_google_user_gets_app_jwt(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "web-client.apps.googleusercontent.com")
    email = f"New-{uuid.uuid4().hex[:8]}@Example.com"
    seen = _stub_verifier(
        monkeypatch,
        claims=_claims(email=email, sub="sub-new", name="New Person"),
    )
    response = client.post("/api/auth/google", json={"credential": "good-token"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert seen["client_id"] == "web-client.apps.googleusercontent.com"
    assert body["email"] == email.lower()
    assert body["name"] == "New Person"
    payload = jwt.decode(
        body["token"],
        os.environ["JWT_SECRET"],
        algorithms=["HS256"],
    )
    assert payload["user_id"] == body["user_id"]
    me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {body['token']}"},
    )
    assert me.status_code == 200, me.text
    assert me.json()["email"] == email.lower()
    stored = _users().find_one({"user_id": body["user_id"]})
    assert stored["password"] is None
    assert stored["google_sub"] == "sub-new"
    assert "good-token" not in response.text


def test_existing_email_lands_on_the_same_account(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "web-client.apps.googleusercontent.com")
    email = f"Ada-{uuid.uuid4().hex[:8]}@Example.com"
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    _users().insert_one({
        "user_id": user_id,
        "email": email,
        "name": "Chosen Name",
        "password": server.hash_password("Test1234!"),
        "picture": None,
    })
    before = _users().find_one({"user_id": user_id})

    _stub_verifier(
        monkeypatch,
        claims=_claims(email=email.lower(), sub="google-ada", name="Google Name"),
    )
    response = client.post("/api/auth/google", json={"credential": "link-token"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["user_id"] == user_id
    assert body["email"] == email
    assert body["name"] == "Chosen Name"

    after = _users().find_one({"user_id": user_id})
    assert after["password"] == before["password"]
    assert server.verify_password("Test1234!", after["password"])
    assert after["google_sub"] == "google-ada"

    registered = client.post(
        "/api/auth/register",
        json={
            "email": f"linked-{uuid.uuid4().hex[:8]}@example.com",
            "password": "Test1234!",
            "name": "Linked User",
        },
    )
    assert registered.status_code == 200, registered.text
    stored_email = registered.json()["email"]
    _stub_verifier(
        monkeypatch,
        claims=_claims(email=stored_email.upper(), sub="google-linked", name="Other"),
    )
    linked = client.post("/api/auth/google", json={"credential": "link-token-2"})
    assert linked.status_code == 200, linked.text
    assert linked.json()["user_id"] == registered.json()["user_id"]
    logged_in = client.post(
        "/api/auth/login",
        json={"email": stored_email, "password": "Test1234!"},
    )
    assert logged_in.status_code == 200, logged_in.text
    assert logged_in.json()["user_id"] == registered.json()["user_id"]


def test_google_rate_limit(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "web-client.apps.googleusercontent.com")
    _stub_verifier(monkeypatch, error=ValueError("nope"))
    statuses = [
        client.post("/api/auth/google", json={"credential": f"token-{i}"}).status_code
        for i in range(11)
    ]
    assert statuses[:10] == [401] * 10
    assert statuses[10] == 429


def test_emergent_session_route_is_gone(client):
    response = client.post("/api/auth/session", json={"session_id": "old"})
    assert response.status_code == 404
