"""Per-device push subscriptions and logout cleanup."""
import asyncio
import os
import uuid

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "mojichat_stage3_push_tests")
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


def _auth(user):
    return {"Authorization": f"Bearer {user['token']}"}


def _register(client):
    response = client.post(
        "/api/auth/register",
        json={
            "email": f"push-{uuid.uuid4().hex[:8]}@example.com",
            "password": "Test1234!",
            "name": "Push",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def _rows(user_id):
    return list(_db().push_subscriptions.find({"user_id": user_id}))


def test_subscribe_keeps_one_row_per_endpoint(client):
    user = _register(client)
    headers = _auth(user)
    phone = f"ExponentPushToken[{uuid.uuid4().hex}]"
    web = f"https://push.example/{uuid.uuid4().hex}"
    native = f"fcm-{uuid.uuid4().hex}"
    for path, body in (
        ("/api/notifications/subscribe", {"endpoint": phone, "keys": {"expo": True}, "device_id": "phone-1"}),
        ("/api/notifications/subscribe", {"endpoint": web, "keys": {"p256dh": "k", "auth": "a"}}),
        ("/api/notifications/subscribe-fcm", {"fcm_token": native, "device_id": "phone-1"}),
    ):
        response = client.post(path, headers=headers, json=body)
        assert response.status_code == 200, response.text
    assert sorted(row["endpoint"] for row in _rows(user["user_id"])) == sorted([phone, web, native])
    again = client.post(
        "/api/notifications/subscribe",
        headers=headers,
        json={"endpoint": phone, "keys": {"expo": True}, "device_id": "phone-1"},
    )
    assert again.status_code == 200, again.text
    assert len(_rows(user["user_id"])) == 3
    stored = _db().push_subscriptions.find_one({"endpoint": web})
    assert stored["device_id"] == web
    assert stored["user_id"] == user["user_id"]


def test_delivery_uses_one_token_per_device():
    chosen = server.choose_push_endpoints([
        {"endpoint": "ExponentPushToken[phone]", "device_id": "phone-1"},
        {"endpoint": "fcm-phone-1", "device_id": "phone-1"},
        {"endpoint": "https://push.example/web"},
    ])
    assert chosen == ["ExponentPushToken[phone]", "https://push.example/web"]


def test_logout_removes_only_the_sent_endpoints(client):
    user = _register(client)
    headers = _auth(user)
    phone = f"ExponentPushToken[{uuid.uuid4().hex}]"
    web = f"https://push.example/{uuid.uuid4().hex}"
    client.post(
        "/api/notifications/subscribe",
        headers=headers,
        json={"endpoint": phone, "keys": {"expo": True}, "device_id": "phone-1"},
    )
    client.post(
        "/api/notifications/subscribe",
        headers=headers,
        json={"endpoint": web, "keys": {"p256dh": "k", "auth": "a"}},
    )
    removed = client.request(
        "DELETE",
        "/api/notifications/unsubscribe",
        headers=headers,
        json={"endpoint": web},
    )
    assert removed.status_code == 200, removed.text
    logged_out = client.post("/api/auth/logout", headers=headers, json={"endpoints": [phone]})
    assert logged_out.status_code == 200, logged_out.text
    assert _rows(user["user_id"]) == []

    client.post(
        "/api/notifications/subscribe",
        headers=headers,
        json={"endpoint": phone, "keys": {"expo": True}, "device_id": "phone-1"},
    )
    client.post(
        "/api/notifications/subscribe",
        headers=headers,
        json={"endpoint": web, "keys": {"p256dh": "k", "auth": "a"}},
    )
    other = _register(client)
    other_phone = f"ExponentPushToken[{uuid.uuid4().hex}]"
    client.post(
        "/api/notifications/subscribe",
        headers=_auth(other),
        json={"endpoint": other_phone, "keys": {"expo": True}, "device_id": "other-phone"},
    )
    empty = client.post(
        "/api/auth/logout",
        headers=headers,
        json={"endpoint": other_phone},
    )
    assert empty.status_code == 200, empty.text
    assert sorted(row["endpoint"] for row in _rows(user["user_id"])) == sorted([phone, web])
    assert [row["endpoint"] for row in _rows(other["user_id"])] == [other_phone]
    missing = client.request("DELETE", "/api/notifications/unsubscribe", headers=headers, json={})
    assert missing.status_code == 400


def test_logout_all_removes_every_subscription_for_that_user(client):
    user = _register(client)
    other = _register(client)
    phone = f"ExponentPushToken[{uuid.uuid4().hex}]"
    web = f"https://push.example/{uuid.uuid4().hex}"
    other_phone = f"ExponentPushToken[{uuid.uuid4().hex}]"
    client.post(
        "/api/notifications/subscribe",
        headers=_auth(user),
        json={"endpoint": phone, "keys": {"expo": True}, "device_id": "phone-1"},
    )
    client.post(
        "/api/notifications/subscribe",
        headers=_auth(user),
        json={"endpoint": web, "keys": {"p256dh": "k", "auth": "a"}},
    )
    client.post(
        "/api/notifications/subscribe",
        headers=_auth(other),
        json={"endpoint": other_phone, "keys": {"expo": True}, "device_id": "other-phone"},
    )
    revoked = client.post("/api/auth/logout-all", headers=_auth(user))
    assert revoked.status_code == 200, revoked.text
    assert _rows(user["user_id"]) == []
    assert [row["endpoint"] for row in _rows(other["user_id"])] == [other_phone]


def _run(coro):
    return _LOOP.run_until_complete(coro)


def test_message_push_skips_web_subscriptions(client):
    user = _register(client)
    headers = _auth(user)
    phone = f"ExponentPushToken[{uuid.uuid4().hex}]"
    web = f"https://push.example/{uuid.uuid4().hex}"
    assert client.post(
        "/api/notifications/subscribe",
        headers=headers,
        json={"endpoint": phone, "keys": {"expo": True}, "device_id": "phone-1"},
    ).status_code == 200
    assert client.post(
        "/api/notifications/subscribe",
        headers=headers,
        json={"endpoint": web, "keys": {"p256dh": "k", "auth": "a"}},
    ).status_code == 200
    rows = list(_db().push_subscriptions.find(
        {"user_id": user["user_id"], "token_type": {"$ne": "web"}},
    ))
    assert [row["endpoint"] for row in rows] == [phone]
    assert _db().push_subscriptions.find_one({"endpoint": web})["token_type"] == "web"


def test_unregistered_push_errors_delete_the_row(client):
    class UnregisteredError(Exception):
        pass

    assert server.push_failure_is_unregistered(
        ticket={"status": "error", "details": {"error": "DeviceNotRegistered"}},
    )
    assert not server.push_failure_is_unregistered(
        ticket={"status": "error", "details": {"error": "MessageRateExceeded"}},
    )
    assert server.push_failure_is_unregistered(exc=UnregisteredError("gone"))
    assert server.push_failure_is_unregistered(exc=Exception("registration-token-not-registered"))
    assert not server.push_failure_is_unregistered(exc=Exception("unavailable"))

    token = f"ExponentPushToken[{uuid.uuid4().hex}]"
    user_id = f"user_{uuid.uuid4().hex[:8]}"
    _db().push_subscriptions.insert_one({
        "user_id": user_id,
        "endpoint": token,
        "token_type": "expo",
        "device_id": "phone-1",
    })
    assert _run(server.drop_unregistered_push_token(
        token,
        ticket={"status": "error", "details": {"error": "DeviceNotRegistered"}},
    )) is True
    assert _db().push_subscriptions.find_one({"endpoint": token}) is None

    kept = f"fcm-{uuid.uuid4().hex}"
    _db().push_subscriptions.insert_one({"user_id": user_id, "endpoint": kept, "token_type": "fcm"})
    assert _run(server.drop_unregistered_push_token(kept, exc=Exception("unavailable"))) is False
    assert _db().push_subscriptions.find_one({"endpoint": kept})["token_type"] == "fcm"


def test_startup_drops_the_unique_user_push_index():
    coll = _db().push_subscriptions
    coll.delete_many({})
    for name in ("user_id_1",):
        try:
            coll.drop_index(name)
        except Exception:
            pass
    coll.create_index("user_id", unique=True)
    server.dedupe_push_subscriptions()
    for spec in coll.index_information().values():
        if list(spec.get("key") or []) == [("user_id", 1)]:
            assert not spec.get("unique")
