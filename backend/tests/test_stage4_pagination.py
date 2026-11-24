"""Cursor pages for messages and conversations, without changing the list shape."""
import asyncio
import os
import uuid

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "mojichat_stage4_tests")
os.environ.setdefault("JWT_SECRET", "ci_test_secret_long_enough_value")

_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)

import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient

import server


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as test_client:
        yield test_client


def _db():
    return MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


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


def _auth(user):
    return {"Authorization": f"Bearer {user['token']}"}


def test_message_pages_stay_a_list_and_follow_the_cursor(client):
    owner = _register(client, "Owner")
    friend = _register(client, "Friend")
    created = client.post(
        "/api/conversations",
        headers=_auth(owner),
        json={"participant_ids": [friend["user_id"]]},
    )
    assert created.status_code == 200, created.text
    conversation_id = created.json()["conversation_id"]
    suffix = uuid.uuid4().hex[:8]
    _db().messages.insert_many([
        {
            "message_id": f"m-{suffix}-{stamp}",
            "conversation_id": conversation_id,
            "sender_id": friend["user_id"],
            "sender_name": "Friend",
            "content": stamp,
            "message_type": "text",
            "created_at": f"2024-01-0{stamp}T00:00:00+00:00",
            "read_by": [friend["user_id"]],
        }
        for stamp in ("1", "2", "3")
    ])

    first = client.get(
        f"/api/conversations/{conversation_id}/messages",
        headers=_auth(owner),
        params={"limit": 2},
    )
    assert first.status_code == 200, first.text
    assert isinstance(first.json(), list)
    assert [item["content"] for item in first.json()] == ["2", "3"]
    cursor = first.headers.get("x-next-cursor")
    assert cursor

    older = client.get(
        f"/api/conversations/{conversation_id}/messages",
        headers=_auth(owner),
        params={"limit": 2, "cursor": cursor},
    )
    assert older.status_code == 200, older.text
    assert [item["content"] for item in older.json()] == ["1"]
    assert "x-next-cursor" not in older.headers

    legacy = client.get(
        f"/api/conversations/{conversation_id}/messages",
        headers=_auth(owner),
        params={"before": "2024-01-03T00:00:00+00:00", "limit": 10},
    )
    assert [item["content"] for item in legacy.json()] == ["1", "2"]
    assert client.get(
        f"/api/conversations/{conversation_id}/messages",
        headers=_auth(owner),
        params={"cursor": "not-a-cursor"},
    ).status_code == 422
    huge = client.get(
        f"/api/conversations/{conversation_id}/messages",
        headers=_auth(owner),
        params={"limit": 1000},
    )
    assert huge.status_code == 200
    assert len(huge.json()) == 3


def test_conversation_list_batches_last_message_and_pages(client):
    owner = _register(client, "Lister")
    friend = _register(client, "Other")
    headers = _auth(owner)
    first = client.post(
        "/api/conversations",
        headers=headers,
        json={"participant_ids": [friend["user_id"]], "name": "Older"},
    )
    second = client.post(
        "/api/conversations",
        headers=headers,
        json={"participant_ids": [friend["user_id"]], "name": "Newer", "is_group": True},
    )
    assert first.status_code == 200 and second.status_code == 200
    older_id = first.json()["conversation_id"]
    newer_id = second.json()["conversation_id"]
    _db().conversations.update_one(
        {"conversation_id": older_id},
        {"$set": {"created_at": "2024-01-01T00:00:00+00:00"}, "$unset": {"last_message_at": "", "last_message": ""}},
    )
    _db().conversations.update_one(
        {"conversation_id": newer_id},
        {"$set": {"created_at": "2024-06-01T00:00:00+00:00"}, "$unset": {"last_message_at": "", "last_message": ""}},
    )
    _db().messages.insert_many([
        {
            "message_id": f"old-a-{uuid.uuid4().hex[:8]}",
            "conversation_id": older_id,
            "sender_id": friend["user_id"],
            "content": "stale",
            "message_type": "text",
            "created_at": "2024-01-02T00:00:00+00:00",
            "read_by": [],
        },
        {
            "message_id": f"old-b-{uuid.uuid4().hex[:8]}",
            "conversation_id": older_id,
            "sender_id": friend["user_id"],
            "content": "fresh",
            "message_type": "text",
            "created_at": "2024-01-03T00:00:00+00:00",
            "read_by": [],
        },
        {
            "message_id": f"new-a-{uuid.uuid4().hex[:8]}",
            "conversation_id": newer_id,
            "sender_id": owner["user_id"],
            "content": "mine",
            "message_type": "text",
            "created_at": "2024-06-02T00:00:00+00:00",
            "read_by": [owner["user_id"]],
        },
    ])

    server.backfill_last_message_activity()
    page = client.get("/api/conversations", headers=headers, params={"limit": 1})
    assert page.status_code == 200, page.text
    body = page.json()
    assert isinstance(body, list)
    assert [item["conversation_id"] for item in body] == [newer_id]
    assert body[0]["last_message"]["content"] == "mine"
    assert body[0]["unread_count"] == 0
    assert any(person["name"] == "Other" for person in body[0]["participants"])
    cursor = page.headers.get("x-next-cursor")
    assert cursor

    rest = client.get("/api/conversations", headers=headers, params={"limit": 1, "cursor": cursor})
    assert rest.status_code == 200, rest.text
    assert [item["conversation_id"] for item in rest.json()] == [older_id]
    assert rest.json()[0]["last_message"]["content"] == "fresh"
    assert rest.json()[0]["unread_count"] == 2


def test_a_new_message_brings_the_older_chat_to_the_top(client):
    owner = _register(client, "Active")
    friend = _register(client, "Quiet")
    headers = _auth(owner)
    older = client.post(
        "/api/conversations",
        headers=headers,
        json={"participant_ids": [friend["user_id"]], "name": "A"},
    )
    newer = client.post(
        "/api/conversations",
        headers=headers,
        json={"participant_ids": [friend["user_id"]], "name": "B", "is_group": True},
    )
    assert older.status_code == 200 and newer.status_code == 200, (older.text, newer.text)
    older_id = older.json()["conversation_id"]
    sent = client.post(
        f"/api/conversations/{older_id}/messages",
        headers=headers,
        json={"content": "still here", "message_type": "text"},
    )
    assert sent.status_code == 200, sent.text
    listed = client.get("/api/conversations", headers=headers)
    assert listed.status_code == 200, listed.text
    assert listed.json()[0]["conversation_id"] == older_id
    assert listed.json()[0]["last_message"]["content"] == "still here"
    assert listed.json()[1]["conversation_id"] == newer.json()["conversation_id"]


def test_deleting_the_last_message_clears_the_list_snapshot(client):
    owner = _register(client, "Deleter")
    friend = _register(client, "Reader")
    headers = _auth(owner)
    created = client.post(
        "/api/conversations",
        headers=headers,
        json={"participant_ids": [friend["user_id"]]},
    )
    assert created.status_code == 200, created.text
    conversation_id = created.json()["conversation_id"]
    sent = client.post(
        f"/api/conversations/{conversation_id}/messages",
        headers=headers,
        json={"content": "secret text", "message_type": "text"},
    )
    assert sent.status_code == 200, sent.text
    removed = client.delete(f"/api/messages/{sent.json()['message_id']}", headers=headers)
    assert removed.status_code == 200, removed.text
    listed = client.get("/api/conversations", headers=headers)
    assert listed.status_code == 200, listed.text
    last = listed.json()[0]["last_message"]
    assert last["content"] == ""
    assert last["emoji_content"] == ""
    assert last["file_url"] is None
    assert last["deleted"] is True


def test_page_size_is_capped():
    assert server.bounded_limit(1000, 50) == 100
    assert server.bounded_limit(0, 50) == 1
    assert server.bounded_limit(None, 50) == 50


def test_pagination_indexes_are_created(client):
    message_keys = [list(spec["key"]) for spec in _db().messages.index_information().values()]
    conversation_keys = [list(spec["key"]) for spec in _db().conversations.index_information().values()]
    assert [("conversation_id", 1), ("created_at", -1), ("_id", -1)] in message_keys
    assert [("conversation_id", 1), ("sender_id", 1)] in message_keys
    assert [("participant_ids", 1), ("last_message_at", -1), ("_id", -1)] in conversation_keys
