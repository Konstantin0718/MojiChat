"""Membership checks. A caller who is not in the conversation gets 404."""
import asyncio
import os
import uuid

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "mojichat_authz_tests")
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


def _world(client):
    owner = _register(client, "owner")
    friend = _register(client, "friend")
    outsider = _register(client, "outsider")
    created = client.post(
        "/api/conversations",
        headers=_auth(owner),
        json={"participant_ids": [friend["user_id"]]},
    )
    assert created.status_code == 200, created.text
    conversation_id = created.json()["conversation_id"]
    sent = client.post(
        f"/api/conversations/{conversation_id}/messages",
        headers=_auth(owner),
        json={"content": f"secret-{uuid.uuid4().hex[:8]}", "message_type": "text"},
    )
    assert sent.status_code == 200, sent.text
    return {
        "owner": owner,
        "friend": friend,
        "outsider": outsider,
        "conversation_id": conversation_id,
        "message": sent.json(),
    }


def test_conversation_details_and_messages(client):
    world = _world(client)
    cid = world["conversation_id"]
    assert client.get(f"/api/conversations/{cid}", headers=_auth(world["outsider"])).status_code == 404
    assert client.get(f"/api/conversations/{cid}/messages", headers=_auth(world["outsider"])).status_code == 404
    assert client.get(f"/api/conversations/{cid}", headers=_auth(world["friend"])).status_code == 200
    listed = client.get(f"/api/conversations/{cid}/messages", headers=_auth(world["friend"]))
    assert listed.status_code == 200
    assert any(item["message_id"] == world["message"]["message_id"] for item in listed.json())


def test_send_message_requires_membership(client):
    world = _world(client)
    cid = world["conversation_id"]
    denied = client.post(
        f"/api/conversations/{cid}/messages",
        headers=_auth(world["outsider"]),
        json={"content": "nope", "message_type": "text"},
    )
    assert denied.status_code == 404
    allowed = client.post(
        f"/api/conversations/{cid}/messages",
        headers=_auth(world["friend"]),
        json={"content": "hello from friend", "message_type": "text"},
    )
    assert allowed.status_code == 200


def test_typing_requires_membership(client):
    world = _world(client)
    cid = world["conversation_id"]
    assert client.post(
        f"/api/conversations/{cid}/typing",
        headers=_auth(world["outsider"]),
        json={"is_typing": True},
    ).status_code == 404
    assert client.get(
        f"/api/conversations/{cid}/typing",
        headers=_auth(world["outsider"]),
    ).status_code == 404
    assert client.post(
        f"/api/conversations/{cid}/typing",
        headers=_auth(world["friend"]),
        json={"is_typing": True},
    ).status_code == 200
    assert client.get(
        f"/api/conversations/{cid}/typing",
        headers=_auth(world["owner"]),
    ).status_code == 200


def test_members_requires_membership_and_rejects_operators(client):
    owner = _register(client, "group-owner")
    friend = _register(client, "group-friend")
    outsider = _register(client, "group-out")
    created = client.post(
        "/api/conversations",
        headers=_auth(owner),
        json={"participant_ids": [friend["user_id"]], "is_group": True, "name": "Room"},
    )
    assert created.status_code == 200, created.text
    cid = created.json()["conversation_id"]
    assert client.post(
        f"/api/conversations/{cid}/members",
        headers=_auth(outsider),
        json={"user_id": outsider["user_id"]},
    ).status_code == 404
    injected = client.post(
        f"/api/conversations/{cid}/members",
        headers=_auth(owner),
        json={"user_id": {"$gt": ""}},
    )
    assert injected.status_code == 422
    added = client.post(
        f"/api/conversations/{cid}/members",
        headers=_auth(owner),
        json={"user_id": outsider["user_id"]},
    )
    assert added.status_code == 200, added.text


def test_forward_requires_source_and_every_target(client):
    world = _world(client)
    other = _register(client, "other")
    private = client.post(
        "/api/conversations",
        headers=_auth(world["outsider"]),
        json={"participant_ids": [other["user_id"]]},
    )
    assert private.status_code == 200, private.text
    message_id = world["message"]["message_id"]
    assert client.post(
        f"/api/messages/{message_id}/forward",
        headers=_auth(world["outsider"]),
        json={"conversation_ids": [private.json()["conversation_id"]]},
    ).status_code == 404
    assert client.post(
        f"/api/messages/{message_id}/forward",
        headers=_auth(world["owner"]),
        json={"conversation_ids": [private.json()["conversation_id"]]},
    ).status_code == 404
    assert client.post(
        f"/api/messages/{message_id}/forward",
        headers=_auth(world["owner"]),
        json={"conversation_ids": [{"$gt": ""}]},
    ).status_code == 422
    forwarded = client.post(
        f"/api/messages/{message_id}/forward",
        headers=_auth(world["owner"]),
        json={"conversation_ids": [world["conversation_id"]]},
    )
    assert forwarded.status_code == 200, forwarded.text
    assert forwarded.json()["forwarded_message_ids"]


def test_reactions_and_delete_require_membership(client):
    world = _world(client)
    message_id = world["message"]["message_id"]
    assert client.post(
        f"/api/messages/{message_id}/reactions",
        headers=_auth(world["outsider"]),
        json={"emoji": "👍"},
    ).status_code == 404
    assert client.delete(
        f"/api/messages/{message_id}/reactions/%F0%9F%91%8D",
        headers=_auth(world["outsider"]),
    ).status_code == 404
    added = client.post(
        f"/api/messages/{message_id}/reactions",
        headers=_auth(world["friend"]),
        json={"emoji": "👍"},
    )
    assert added.status_code == 200, added.text
    assert "👍" in added.json()["reactions"]
    removed = client.delete(
        f"/api/messages/{message_id}/reactions/%F0%9F%91%8D",
        headers=_auth(world["friend"]),
    )
    assert removed.status_code == 200, removed.text
    assert client.delete(
        f"/api/messages/{message_id}",
        headers=_auth(world["outsider"]),
    ).status_code == 404
    deleted = client.delete(
        f"/api/messages/{message_id}",
        headers=_auth(world["owner"]),
    )
    assert deleted.status_code == 200, deleted.text


def test_search_stays_inside_member_conversations(client):
    world = _world(client)
    secret = world["message"]["content"]
    cid = world["conversation_id"]
    assert client.get(
        "/api/search/messages",
        headers=_auth(world["outsider"]),
        params={"q": secret, "conversation_id": cid},
    ).status_code == 404
    found = client.get(
        "/api/search/messages",
        headers=_auth(world["owner"]),
        params={"q": secret, "conversation_id": cid},
    )
    assert found.status_code == 200, found.text
    assert any(item["message_id"] == world["message"]["message_id"] for item in found.json())
    regex = client.get(
        "/api/search/messages",
        headers=_auth(world["owner"]),
        params={"q": ".*", "conversation_id": cid},
    )
    assert regex.status_code == 200
    assert regex.json() == []
    hidden = client.get(
        "/api/search/messages",
        headers=_auth(world["outsider"]),
        params={"q": secret},
    )
    assert hidden.status_code == 200
    assert hidden.json() == []


def test_call_routes_require_membership(client):
    world = _world(client)
    cid = world["conversation_id"]
    assert client.post(
        "/api/calls/initiate",
        headers=_auth(world["outsider"]),
        json={"conversation_id": cid},
    ).status_code == 404
    assert client.post(
        "/api/calls/initiate",
        headers=_auth(world["owner"]),
        json={"conversation_id": {"$gt": ""}},
    ).status_code == 422
    started = client.post(
        "/api/calls/initiate",
        headers=_auth(world["owner"]),
        json={"conversation_id": cid, "is_video": False},
    )
    assert started.status_code == 200, started.text
    call_id = started.json()["call_id"]
    assert client.post(f"/api/calls/{call_id}/join", headers=_auth(world["outsider"])).status_code == 404
    assert client.post(f"/api/calls/{call_id}/join", headers=_auth(world["friend"])).status_code == 200
    assert client.post(
        f"/api/calls/{call_id}/signal",
        headers=_auth(world["outsider"]),
        json={"type": "offer", "data": {"sdp": "v=0"}},
    ).status_code == 404
    assert client.post(
        f"/api/calls/{call_id}/signal",
        headers=_auth(world["friend"]),
        json={"type": "offer", "data": {"$gt": ""}},
    ).status_code == 422
    signaled = client.post(
        f"/api/calls/{call_id}/signal",
        headers=_auth(world["friend"]),
        json={"type": "offer", "data": {"sdp": "v=0"}, "target_user_id": world["owner"]["user_id"]},
    )
    assert signaled.status_code == 200, signaled.text
    assert client.get(f"/api/calls/{call_id}/signals", headers=_auth(world["outsider"])).status_code == 404
    signals = client.get(f"/api/calls/{call_id}/signals", headers=_auth(world["owner"]))
    assert signals.status_code == 200, signals.text
    assert signals.json()
    assert client.post(f"/api/calls/{call_id}/end", headers=_auth(world["outsider"])).status_code == 404
    assert client.post(f"/api/calls/{call_id}/end", headers=_auth(world["owner"])).status_code == 200


def test_websocket_events_require_membership(client):
    world = _world(client)
    cid = world["conversation_id"]
    message_id = world["message"]["message_id"]
    with client.websocket_connect(
        f"/ws/{world['outsider']['user_id']}?token={world['outsider']['token']}"
    ) as socket:
        socket.send_json({"type": "typing", "conversation_id": cid, "is_typing": True})
        assert socket.receive_json()["status"] == 404
        socket.send_json({"type": "message_read", "conversation_id": cid, "message_id": message_id})
        assert socket.receive_json()["status"] == 404
        socket.send_json({"type": "subscribe_conversation", "conversation_id": cid})
        assert socket.receive_json()["status"] == 404
    assert world["outsider"]["user_id"] not in server.ws_manager.conversation_subscribers.get(cid, set())

    with client.websocket_connect(
        f"/ws/{world['friend']['user_id']}?token={world['friend']['token']}"
    ) as socket:
        socket.send_json({"type": "subscribe_conversation", "conversation_id": cid})
        socket.send_json({"type": "typing", "conversation_id": cid, "is_typing": True})
        socket.send_json({"type": "message_read", "conversation_id": cid, "message_id": message_id})
        socket.send_json({"type": "ping"})
        assert socket.receive_json()["type"] == "pong"
    assert world["friend"]["user_id"] in server.ws_manager.conversation_subscribers.get(cid, set())
    stored = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]].messages.find_one(
        {"message_id": message_id}
    )
    assert world["friend"]["user_id"] in stored["read_by"]
