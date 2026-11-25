"""Firebase Google sign-in replaces the Emergent session exchange."""
import asyncio
import logging
import os
import uuid

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "mojichat_firebase_tests")
os.environ.setdefault("JWT_SECRET", "ci_test_secret_long_enough_value")

_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)

import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient

import server


def _db():
    return MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _clear_limits():
    server._rate_state.clear()
    server._rate_windows.clear()
    yield
    server._rate_state.clear()
    server._rate_windows.clear()


def _google(uid, email, **extra):
    decoded = {
        "uid": uid,
        "email": email,
        "email_verified": True,
        "name": extra.pop("name", "Ada"),
        "firebase": {"sign_in_provider": "google.com"},
    }
    decoded.update(extra)
    return decoded


def _post(client, decoded, token="firebase-id-token", monkeypatch=None):
    def _verify(id_token, check_revoked=True):
        assert check_revoked is True
        assert id_token == token
        if isinstance(decoded, Exception):
            raise decoded
        return decoded

    monkeypatch.setattr(server.firebase_auth, "verify_id_token", _verify)
    return client.post("/api/auth/firebase", json={"id_token": token})


def _register(client, name, email=None):
    email = email or f"{name}-{uuid.uuid4().hex[:8]}@example.com"
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "Test1234!", "name": name},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    body["email"] = email.strip().lower()
    return body


def test_known_firebase_uid_logs_in(client, monkeypatch):
    uid = f"uid-{uuid.uuid4().hex}"
    email = f"known-{uuid.uuid4().hex[:8]}@example.com"
    user_id = f"user_{uuid.uuid4().hex[:8]}"
    _db().users.insert_one({
        "user_id": user_id,
        "email": email,
        "name": "Known",
        "password": None,
        "email_verified": True,
        "firebase_uid": uid,
        "token_version": 0,
    })
    response = _post(client, _google(uid, "other@example.com", name="Known"), monkeypatch=monkeypatch)
    assert response.status_code == 200, response.text
    assert response.json()["user_id"] == user_id
    assert response.json()["email"] == email
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {response.json()['token']}"})
    assert me.status_code == 200
    assert me.json()["user_id"] == user_id


def test_email_link_is_allowed_without_a_password_or_when_verified(client, monkeypatch):
    open_account = _register(client, "Open")
    _db().users.update_one(
        {"user_id": open_account["user_id"]},
        {"$set": {"password": None, "email_verified": False}},
    )
    uid = f"uid-{uuid.uuid4().hex}"
    linked = _post(client, _google(uid, open_account["email"], name="Open"), monkeypatch=monkeypatch)
    assert linked.status_code == 200, linked.text
    assert linked.json()["user_id"] == open_account["user_id"]
    assert _db().users.find_one({"user_id": open_account["user_id"]})["firebase_uid"] == uid

    verified = _register(client, "Verified")
    _db().users.update_one({"user_id": verified["user_id"]}, {"$set": {"email_verified": True}})
    second = f"uid-{uuid.uuid4().hex}"
    again = _post(client, _google(second, verified["email"], name="Verified"), monkeypatch=monkeypatch)
    assert again.status_code == 200, again.text
    assert again.json()["user_id"] == verified["user_id"]
    assert _db().users.find_one({"user_id": verified["user_id"]})["firebase_uid"] == second


def test_unverified_password_account_is_rejected(client, monkeypatch):
    owner = _register(client, "Password")
    uid = f"uid-{uuid.uuid4().hex}"
    response = _post(client, _google(uid, owner["email"]), monkeypatch=monkeypatch)
    assert response.status_code == 409, response.text
    assert response.json()["detail"] == server.FIREBASE_PASSWORD_ACCOUNT_DETAIL
    assert _db().users.find_one({"user_id": owner["user_id"]}).get("firebase_uid") in (None, "")


def test_new_google_user_is_created(client, monkeypatch):
    email = f"new-{uuid.uuid4().hex[:8]}@example.com"
    uid = f"uid-{uuid.uuid4().hex}"
    response = _post(
        client,
        _google(uid, email, name="New Person", picture="https://lh3.googleusercontent.com/a/photo"),
        monkeypatch=monkeypatch,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["email"] == email
    assert body["name"] == "New Person"
    stored = _db().users.find_one({"user_id": body["user_id"]})
    assert stored["password"] is None
    assert stored["email_verified"] is True
    assert stored["firebase_uid"] == uid


def test_non_google_provider_is_rejected(client, monkeypatch):
    email = f"pass-{uuid.uuid4().hex[:8]}@example.com"
    decoded = _google(f"uid-{uuid.uuid4().hex}", email)
    decoded["firebase"] = {"sign_in_provider": "password"}
    response = _post(client, decoded, monkeypatch=monkeypatch)
    assert response.status_code == 401, response.text
    assert _db().users.find_one({"email": email}) is None


def test_invalid_token_is_rejected_without_logging_it(client, monkeypatch, caplog):
    secret = "super-secret-firebase-token-value"
    def _raise(id_token, check_revoked=True):
        raise RuntimeError("rejected")

    monkeypatch.setattr(server.firebase_auth, "verify_id_token", _raise)
    with caplog.at_level(logging.WARNING):
        response = client.post("/api/auth/firebase", json={"id_token": secret})
    assert response.status_code == 401, response.text
    assert secret not in caplog.text


def test_emergent_session_route_and_opaque_tokens_are_gone(client):
    assert client.post("/api/auth/session", json={"session_id": "old"}).status_code == 404
    _db().user_sessions.insert_one({
        "user_id": "user_old",
        "session_token": "opaque-session-token",
        "expires_at": "2099-01-01T00:00:00+00:00",
    })
    me = client.get("/api/auth/me", headers={"Authorization": "Bearer opaque-session-token"})
    assert me.status_code == 401
    server.drop_legacy_user_sessions()
    assert "user_sessions" not in _db().list_collection_names()


def test_firebase_uid_index_skips_duplicates_then_creates(client):
    users = _db().users
    ids = [f"user_fb_{uuid.uuid4().hex[:8]}" for _ in range(2)]
    uid = f"dup-{uuid.uuid4().hex}"
    try:
        for name, spec in list(users.index_information().items()):
            if list(spec.get("key") or []) == [("firebase_uid", 1)]:
                users.drop_index(name)
        users.insert_many([
            {"user_id": ids[0], "email": f"{ids[0]}@example.com", "firebase_uid": uid},
            {"user_id": ids[1], "email": f"{ids[1]}@example.com", "firebase_uid": uid},
        ])
        assert server.ensure_unique_firebase_uid_index() == "skipped"
        users.delete_many({"user_id": {"$in": ids}})
        assert server.ensure_unique_firebase_uid_index() == "created"
        assert server.ensure_unique_firebase_uid_index() == "exists"
        spec = next(
            spec for spec in users.index_information().values()
            if list(spec.get("key") or []) == [("firebase_uid", 1)]
        )
        assert server._firebase_uid_index_is_ready(spec)
    finally:
        users.delete_many({"user_id": {"$in": ids}})
        server.ensure_unique_firebase_uid_index()
