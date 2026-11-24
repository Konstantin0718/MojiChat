"""Auth, size, and rate limits for routes that can call the LLM."""
import asyncio
import logging
import os
import sys
import types
import uuid

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "mojichat_llm_tests")
os.environ.setdefault("JWT_SECRET", "ci_test_secret_long_enough_value")
os.environ["EMERGENT_LLM_KEY"] = ""

_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)

import pytest
from fastapi.testclient import TestClient

import server


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _clear_limits(monkeypatch):
    server._rate_state.clear()
    monkeypatch.delenv("LLM_MAX_INPUT_CHARS", raising=False)
    monkeypatch.delenv("LLM_RATE_PER_MINUTE", raising=False)
    monkeypatch.delenv("LLM_RATE_PER_DAY", raising=False)
    monkeypatch.delenv("LLM_IP_RATE_PER_MINUTE", raising=False)
    monkeypatch.setenv("EMERGENT_LLM_KEY", "")
    yield
    server._rate_state.clear()


def _register(client):
    response = client.post(
        "/api/auth/register",
        json={
            "email": f"llm-{uuid.uuid4().hex[:8]}@example.com",
            "password": "Test1234!",
            "name": "LLM",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def _auth(user):
    return {"Authorization": f"Bearer {user['token']}"}


def test_llm_routes_require_auth(client):
    assert client.post("/api/emoji/convert", json={"text": "hi"}).status_code == 401
    assert client.post("/api/translate", json={"text": "hi", "target_language": "bg"}).status_code == 401


def test_llm_routes_reject_text_over_the_limit(client, monkeypatch):
    monkeypatch.setenv("LLM_MAX_INPUT_CHARS", "20")
    user = _register(client)
    text = "x" * 21
    converted = client.post("/api/emoji/convert", headers=_auth(user), json={"text": text})
    translated = client.post(
        "/api/translate",
        headers=_auth(user),
        json={"text": text, "target_language": "en"},
    )
    assert converted.status_code == 413
    assert translated.status_code == 413
    assert text not in converted.text
    assert text not in translated.text
    allowed = client.post("/api/emoji/convert", headers=_auth(user), json={"text": "x" * 20})
    assert allowed.status_code == 200, allowed.text


def test_per_user_minute_limit_returns_retry_after(client, monkeypatch):
    monkeypatch.setenv("LLM_RATE_PER_MINUTE", "2")
    monkeypatch.setenv("LLM_RATE_PER_DAY", "100")
    monkeypatch.setenv("LLM_IP_RATE_PER_MINUTE", "100")
    user = _register(client)
    headers = _auth(user)
    assert client.post("/api/emoji/convert", headers=headers, json={"text": "one"}).status_code == 200
    assert client.post("/api/translate", headers=headers, json={"text": "two", "target_language": "en"}).status_code == 200
    blocked = client.post("/api/emoji/convert", headers=headers, json={"text": "three"})
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1


def test_daily_cap_is_separate_from_the_minute_limit(client, monkeypatch):
    monkeypatch.setenv("LLM_RATE_PER_MINUTE", "10")
    monkeypatch.setenv("LLM_RATE_PER_DAY", "1")
    monkeypatch.setenv("LLM_IP_RATE_PER_MINUTE", "10")
    user = _register(client)
    headers = _auth(user)
    assert client.post("/api/emoji/convert", headers=headers, json={"text": "one"}).status_code == 200
    blocked = client.post("/api/translate", headers=headers, json={"text": "two", "target_language": "en"})
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1


def test_ip_limit_uses_true_client_ip(client, monkeypatch):
    monkeypatch.setenv("LLM_RATE_PER_MINUTE", "10")
    monkeypatch.setenv("LLM_RATE_PER_DAY", "10")
    monkeypatch.setenv("LLM_IP_RATE_PER_MINUTE", "1")
    first = _register(client)
    second = _register(client)
    one = client.post(
        "/api/emoji/convert",
        headers={**_auth(first), "True-Client-IP": "203.0.113.10"},
        json={"text": "a"},
    )
    assert one.status_code == 200, one.text
    same_ip = client.post(
        "/api/emoji/convert",
        headers={**_auth(second), "True-Client-IP": "203.0.113.10"},
        json={"text": "b"},
    )
    assert same_ip.status_code == 429
    other_ip = client.post(
        "/api/emoji/convert",
        headers={**_auth(second), "True-Client-IP": "203.0.113.20"},
        json={"text": "c"},
    )
    assert other_ip.status_code == 200, other_ip.text


def test_chat_send_is_limited_before_the_model(client, monkeypatch):
    monkeypatch.setenv("LLM_MAX_INPUT_CHARS", "10")
    owner = _register(client)
    friend = _register(client)
    created = client.post(
        "/api/conversations",
        headers=_auth(owner),
        json={"participant_ids": [friend["user_id"]]},
    )
    assert created.status_code == 200, created.text
    sent = client.post(
        f"/api/conversations/{created.json()['conversation_id']}/messages",
        headers=_auth(owner),
        json={"content": "x" * 11, "message_type": "text"},
    )
    assert sent.status_code == 413
    assert "x" * 11 not in sent.text


def test_conversion_errors_do_not_log_the_input(client, monkeypatch, caplog):
    secret = f"UNIQUE_INPUT_{uuid.uuid4().hex}"

    class Boom:
        def __init__(self, **kwargs):
            pass

        def with_model(self, *args, **kwargs):
            return self

        async def send_message(self, message):
            raise RuntimeError("model failed")

    module = types.ModuleType("emergentintegrations.llm.chat")
    module.LlmChat = Boom
    module.UserMessage = lambda text: text
    monkeypatch.setitem(sys.modules, "emergentintegrations.llm.chat", module)
    monkeypatch.setenv("EMERGENT_LLM_KEY", "test-key-not-a-secret")
    user = _register(client)
    caplog.set_level(logging.ERROR, logger="server")
    response = client.post(
        "/api/translate",
        headers=_auth(user),
        json={"text": secret, "target_language": "en"},
    )
    assert response.status_code == 200
    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert secret not in logged
    assert "Translation error: RuntimeError" in logged
