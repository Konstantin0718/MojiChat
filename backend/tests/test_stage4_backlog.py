"""Search limits, the partial email index, and limiter cleanup."""
import asyncio
import os
import time
import uuid

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "mojichat_backlog_tests")
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


def _register(client, name):
    response = client.post(
        "/api/auth/register",
        json={
            "email": f"{name}-{uuid.uuid4().hex[:8]}@example.com",
            "password": "Test1234!",
            "name": name,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def _clear_limits():
    server._rate_state.clear()
    server._rate_windows.clear()
    server._last_rate_purge = time.time()


def _email_indexes():
    info = _db().users.index_information()
    return {
        name: spec
        for name, spec in info.items()
        if list(spec.get("key") or []) == [("email", 1)]
    }


def test_user_search_requires_two_characters_and_is_limited_per_user(client):
    owner = _register(client, "Seeker")
    friend = _register(client, "Foundling")
    _clear_limits()
    short = client.get("/api/users/search", headers=_auth(owner), params={"q": "F"})
    assert short.status_code == 200, short.text
    assert short.json() == []
    assert len(server._rate_state[f"user_search:{owner['user_id']}"]) == 1

    found = client.get("/api/users/search", headers=_auth(owner), params={"q": "Fo"})
    assert found.status_code == 200, found.text
    assert any(item["user_id"] == friend["user_id"] for item in found.json())

    _clear_limits()
    for _ in range(server.USER_SEARCH_LIMIT):
        response = client.get("/api/users/search", headers=_auth(owner), params={"q": "Fo"})
        assert response.status_code == 200, response.text
    blocked = client.get("/api/users/search", headers=_auth(owner), params={"q": "Fo"})
    assert blocked.status_code == 429, blocked.text
    assert blocked.headers.get("retry-after")

    other = client.get("/api/users/search", headers=_auth(friend), params={"q": "Se"})
    assert other.status_code == 200, other.text
    assert any(item["user_id"] == owner["user_id"] for item in other.json())


def test_rate_buckets_expire_and_the_sweep_is_periodic():
    _clear_limits()
    now = time.time()
    server._rate_state["old"] = [now - 120]
    server._rate_windows["old"] = 60
    server._rate_state["fresh"] = [now]
    server._rate_windows["fresh"] = 60
    assert server.purge_rate_state(now) == 1
    assert "old" not in server._rate_state
    assert "old" not in server._rate_windows
    assert server._rate_state["fresh"] == [now]

    server._rate_state["stale"] = [now - 30]
    server._rate_windows["stale"] = 10
    server._last_rate_purge = now
    _run(server.enforce_named_rate_limit("keep", 5, 60))
    assert "stale" in server._rate_state
    server._last_rate_purge = now - server._RATE_PURGE_SECONDS - 1
    _run(server.enforce_named_rate_limit("keep", 5, 60))
    assert "stale" not in server._rate_state
    assert "keep" in server._rate_state


def test_duplicate_emails_skip_the_unique_index_and_a_clean_set_creates_it(client):
    users = _db().users
    duplicate_ids = [f"user_dup_{uuid.uuid4().hex[:8]}" for _ in range(2)]
    blank_ids = [f"user_blank_{uuid.uuid4().hex[:8]}" for _ in range(2)]
    try:
        for name in list(_email_indexes()):
            users.drop_index(name)
        users.insert_many([
            {"user_id": duplicate_ids[0], "email": "Dup@Example.com"},
            {"user_id": duplicate_ids[1], "email": " dup@example.com "},
        ])
        assert server.ensure_unique_email_index() == "skipped"
        assert _email_indexes() == {}

        users.delete_many({"user_id": {"$in": duplicate_ids}})
        users.insert_many([
            {"user_id": blank_ids[0], "email": None},
            {"user_id": blank_ids[1]},
        ])
        assert server.ensure_unique_email_index() == "created"
        assert server.ensure_unique_email_index() == "exists"
        spec = next(iter(_email_indexes().values()))
        assert server._email_index_is_ready(spec)
        assert users.count_documents({"user_id": {"$in": blank_ids}}) == 2
    finally:
        users.delete_many({"user_id": {"$in": duplicate_ids + blank_ids}})
        server.ensure_unique_email_index()
