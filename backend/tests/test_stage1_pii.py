"""Public profiles, email normalization, and startup maintenance."""
import asyncio
import os
import uuid

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "mojichat_pii_tests")
os.environ.setdefault("JWT_SECRET", "ci_test_secret_long_enough_value")

_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)

import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient

import server


def _run(coro):
    return _LOOP.run_until_complete(coro)


def _db():
    return MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as test_client:
        yield test_client


def _auth(user):
    return {"Authorization": f"Bearer {user['token']}"}


def _register(client, name, email=None):
    email = email or f"{name}-{uuid.uuid4().hex[:8]}@example.com"
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "Test1234!", "name": name},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    body["password"] = "Test1234!"
    return body


def test_register_and_login_use_lowercase_email(client):
    raw = f"Ada.{uuid.uuid4().hex[:6]}@Example.com"
    created = _register(client, "Ada", raw)
    assert created["email"] == raw.strip().lower()
    logged = client.post(
        "/api/auth/login",
        json={"email": raw.upper(), "password": "Test1234!"},
    )
    assert logged.status_code == 200, logged.text
    assert logged.json()["user_id"] == created["user_id"]


def test_profiles_hide_private_fields(client):
    owner = _register(client, "Owner")
    other = _register(client, "Other")
    _db().users.update_one(
        {"user_id": other["user_id"]},
        {"$set": {"phone_number": "+359888000111", "username": "othername", "bio": "hi"}},
    )
    headers = _auth(owner)
    searched = client.get("/api/users/search", headers=headers, params={"q": "Other"})
    assert searched.status_code == 200, searched.text
    assert searched.json()
    profile = next(item for item in searched.json() if item["user_id"] == other["user_id"])
    assert set(profile) <= {
        "user_id", "name", "username", "picture", "bio", "status", "is_online", "last_seen",
    }
    assert "email" not in profile
    assert "phone_number" not in profile
    assert "password" not in profile

    partial = client.get(
        "/api/users/search",
        headers=headers,
        params={"q": other["email"].split("@")[0]},
    )
    assert all(item["user_id"] != other["user_id"] for item in partial.json())
    exact = client.get(
        "/api/users/search",
        headers=headers,
        params={"q": other["email"].upper()},
    )
    assert any(item["user_id"] == other["user_id"] for item in exact.json())
    assert "email" not in exact.json()[0]

    other_view = client.get(f"/api/users/{owner['user_id']}", headers=_auth(other))
    assert other_view.status_code == 200
    assert "email" not in other_view.json()
    own_view = client.get(f"/api/users/{owner['user_id']}", headers=headers)
    assert own_view.json()["email"] == owner["email"]
    me = client.get("/api/auth/me", headers=headers)
    assert me.json()["email"] == owner["email"]
    assert "password" not in me.json()

    created = client.post(
        "/api/conversations",
        headers=headers,
        json={"participant_ids": [other["user_id"]]},
    )
    assert created.status_code == 200, created.text
    detail = client.get(
        f"/api/conversations/{created.json()['conversation_id']}",
        headers=headers,
    )
    assert detail.status_code == 200
    assert all("email" not in person and "phone_number" not in person for person in detail.json()["participants"])


def test_add_member_rejects_missing_and_blocked_users(client):
    owner = _register(client, "Lead")
    friend = _register(client, "Mate")
    blocked = _register(client, "Blocked")
    created = client.post(
        "/api/conversations",
        headers=_auth(owner),
        json={"participant_ids": [friend["user_id"]], "is_group": True, "name": "Room"},
    )
    assert created.status_code == 200, created.text
    cid = created.json()["conversation_id"]
    missing = client.post(
        f"/api/conversations/{cid}/members",
        headers=_auth(owner),
        json={"user_id": "user_does_not_exist"},
    )
    assert missing.status_code == 404
    client.post(f"/api/users/{blocked['user_id']}/block", headers=_auth(owner))
    denied = client.post(
        f"/api/conversations/{cid}/members",
        headers=_auth(owner),
        json={"user_id": blocked["user_id"]},
    )
    assert denied.status_code == 404
    fresh = _register(client, "Fresh")
    added = client.post(
        f"/api/conversations/{cid}/members",
        headers=_auth(owner),
        json={"user_id": fresh["user_id"]},
    )
    assert added.status_code == 200, added.text


def test_forward_rejects_a_deleted_message(client):
    owner = _register(client, "Sender")
    friend = _register(client, "Reader")
    created = client.post(
        "/api/conversations",
        headers=_auth(owner),
        json={"participant_ids": [friend["user_id"]]},
    )
    cid = created.json()["conversation_id"]
    sent = client.post(
        f"/api/conversations/{cid}/messages",
        headers=_auth(owner),
        json={"content": "keep", "message_type": "text"},
    )
    message_id = sent.json()["message_id"]
    assert client.delete(f"/api/messages/{message_id}", headers=_auth(owner)).status_code == 200
    forwarded = client.post(
        f"/api/messages/{message_id}/forward",
        headers=_auth(owner),
        json={"conversation_ids": [cid]},
    )
    assert forwarded.status_code == 404


def test_send_verification_requires_the_signed_in_user(client):
    user = _register(client, "Verifier")
    anonymous = client.post("/api/auth/send-verification", json={"email": user["email"]})
    assert anonymous.status_code == 401
    sent = client.post(
        "/api/auth/send-verification",
        headers=_auth(user),
        json={"email": "other-person@example.com"},
    )
    assert sent.status_code == 200
    assert sent.json() == {"message": "Verification email sent"}
    assert _db().email_verifications.find_one({"email": user["email"]})
    assert _db().email_verifications.find_one({"email": "other-person@example.com"}) is None


def test_email_normalize_reports_collisions_without_merging():
    suffix = uuid.uuid4().hex[:8]
    first = f"user_{uuid.uuid4().hex[:8]}"
    second = f"user_{uuid.uuid4().hex[:8]}"
    alone = f"user_{uuid.uuid4().hex[:8]}"
    users = _db().users
    # Case variants cannot be inserted while the partial unique index is in place.
    # This is the older rows that startup finds before it decides to skip that index.
    for name, spec in list(users.index_information().items()):
        if list(spec.get("key") or []) == [("email", 1)]:
            users.drop_index(name)
    try:
        users.insert_many([
            {"user_id": first, "email": f"Case.{suffix}@Example.com", "name": "A"},
            {"user_id": second, "email": f"case.{suffix}@example.com", "name": "B"},
            {"user_id": alone, "email": f"Solo.{suffix}@Example.com", "name": "C"},
        ])
        result = server.normalize_stored_emails()
        assert result["collisions"] >= 1
        assert users.find_one({"user_id": first})["email"] == f"Case.{suffix}@Example.com"
        assert users.find_one({"user_id": second})["email"] == f"case.{suffix}@example.com"
        assert users.find_one({"user_id": alone})["email"] == f"solo.{suffix}@example.com"
        assert server.ensure_unique_email_index() == "skipped"
    finally:
        users.delete_many({"user_id": {"$in": [first, second, alone]}})
        server.ensure_unique_email_index()


def test_push_dedupe_keeps_distinct_devices_and_the_newest_duplicate():
    user_id = f"user_{uuid.uuid4().hex[:8]}"
    phone = f"phone-{uuid.uuid4().hex}"
    web = f"web-{uuid.uuid4().hex}"
    for name in ("user_id_1", "endpoint_1"):
        try:
            _db().push_subscriptions.drop_index(name)
        except Exception:
            pass
    _db().push_subscriptions.insert_many([
        {"user_id": user_id, "endpoint": phone, "created_at": "2024-01-01T00:00:00"},
        {"user_id": user_id, "endpoint": web, "updated_at": "2020-01-01T00:00:00", "created_at": "2020-01-01T00:00:00"},
        {"user_id": user_id, "endpoint": web, "updated_at": "2024-06-01T00:00:00", "created_at": "2024-06-01T00:00:00"},
    ])
    server.dedupe_push_subscriptions()
    rows = list(_db().push_subscriptions.find({"user_id": user_id}))
    assert sorted(row["endpoint"] for row in rows) == sorted([phone, web])
    kept = next(row for row in rows if row["endpoint"] == web)
    assert kept["updated_at"] == "2024-06-01T00:00:00"


def test_one_index_failure_does_not_stop_the_next():
    calls = []

    async def fail():
        raise RuntimeError("duplicate")

    async def succeed():
        calls.append("ok")

    _run(server._safe_index("bad", fail()))
    _run(server._safe_index("good", succeed()))
    assert calls == ["ok"]
