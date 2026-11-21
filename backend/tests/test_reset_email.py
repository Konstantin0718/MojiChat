"""Reset email tests. They mock Brevo and never call the real API."""
import asyncio
import hashlib
import logging
import os
import uuid

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "mojichat_reset_tests")
os.environ.setdefault("JWT_SECRET", "ci_test_secret_long_enough_value")
os.environ["EXPOSE_RESET_TOKEN"] = ""

_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)

import httpx
import pytest
import respx
from fastapi.testclient import TestClient
from pymongo import MongoClient

import server
from server import (
    BREVO_EMAIL_URL,
    RESET_EMAIL_MESSAGE,
    _forgot_hits,
    _warn_email_from_missing,
    deliver_reset_email,
    hash_reset_token,
)


def _run(coro):
    return _LOOP.run_until_complete(coro)


def _resets():
    client = MongoClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]].password_resets


def _clear_limits():
    _forgot_hits.clear()


@pytest.fixture(scope="module")
def client():
    _clear_limits()
    os.environ["EXPOSE_RESET_TOKEN"] = ""
    with TestClient(server.app) as test_client:
        yield test_client
    _clear_limits()


def _register(client, name):
    email = f"{name}-{uuid.uuid4().hex[:8]}@example.com"
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "Test1234!", "name": name},
    )
    assert response.status_code == 200, response.text
    return email


def _pin_token(monkeypatch, raw):
    monkeypatch.setattr(server, "_new_reset_token", lambda: raw)


def _log_text(caplog):
    return "\n".join(
        record.getMessage()
        for record in caplog.records
        if record.name == "uvicorn.error"
    )


def test_hash_is_sha256():
    raw = "abc"
    assert hash_reset_token(raw) == hashlib.sha256(raw.encode("utf-8")).hexdigest()
    assert raw not in hash_reset_token(raw)


def test_startup_warning_does_not_include_the_key(monkeypatch, caplog):
    secret = "brevo-key-startup-should-stay-out-of-logs"
    monkeypatch.setenv("BREVO_API_KEY", secret)
    monkeypatch.delenv("EMAIL_FROM", raising=False)
    monkeypatch.delenv("SMTP_FROM", raising=False)
    caplog.set_level(logging.WARNING, logger="uvicorn.error")
    _warn_email_from_missing()
    text = _log_text(caplog)
    assert "EMAIL_FROM is empty" in text
    assert secret not in text


def test_brevo_success_logs_hide_token_and_key(monkeypatch, caplog):
    secret = "brevo-key-success-hidden"
    raw = "11" * 16
    monkeypatch.setenv("BREVO_API_KEY", secret)
    monkeypatch.setenv("EMAIL_FROM", "from@example.com")
    monkeypatch.setenv("EMAIL_FROM_NAME", "MojiChat")
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:3000")
    caplog.set_level(logging.DEBUG, logger="uvicorn.error")
    seen = {}
    with respx.mock:
        real_client = httpx.AsyncClient

        def factory(*args, **kwargs):
            seen["timeout"] = kwargs.get("timeout")
            return real_client(*args, **kwargs)

        monkeypatch.setattr(httpx, "AsyncClient", factory)
        route = respx.post(BREVO_EMAIL_URL).mock(
            return_value=httpx.Response(201, json={"messageId": raw + secret})
        )
        _run(deliver_reset_email("person@example.com", raw))
    assert route.called
    assert seen["timeout"] == 10
    sent = route.calls[0].request
    assert sent.headers["api-key"] == secret
    body = sent.read().decode()
    assert raw in body
    assert "htmlContent" in body
    assert "textContent" in body
    text = _log_text(caplog)
    assert "Password reset email sent" in text
    assert raw not in text
    assert secret not in text


def test_brevo_http_error_logs_status_only(monkeypatch, caplog):
    secret = "brevo-key-error-hidden"
    raw = "22" * 16
    monkeypatch.setenv("BREVO_API_KEY", secret)
    monkeypatch.setenv("EMAIL_FROM", "from@example.com")
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:3000")
    caplog.set_level(logging.DEBUG, logger="uvicorn.error")

    class SmtpBlocked:
        def __init__(self, *args, **kwargs):
            raise AssertionError("SMTP must not run when Brevo is configured")

    monkeypatch.setattr(server.smtplib, "SMTP", SmtpBlocked)
    monkeypatch.setattr(server.smtplib, "SMTP_SSL", SmtpBlocked)
    with respx.mock:
        respx.post(BREVO_EMAIL_URL).mock(
            return_value=httpx.Response(500, text=raw + secret + "LEAKBODY")
        )
        _run(deliver_reset_email("person@example.com", raw))
    text = _log_text(caplog)
    assert "brevo status=500" in text
    assert raw not in text
    assert secret not in text
    assert "LEAKBODY" not in text


def test_not_configured_log_hides_token(monkeypatch, caplog):
    raw = "33" * 16
    monkeypatch.delenv("BREVO_API_KEY", raising=False)
    monkeypatch.delenv("SMTP_HOST", raising=False)
    caplog.set_level(logging.DEBUG, logger="uvicorn.error")
    _run(deliver_reset_email("person@example.com", raw))
    text = _log_text(caplog)
    assert "Password reset email is not configured" in text
    assert raw not in text


def test_smtp_timeout_is_ten_seconds(monkeypatch, caplog):
    raw = "44" * 16
    monkeypatch.delenv("BREVO_API_KEY", raising=False)
    monkeypatch.setenv("SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("EMAIL_FROM", "from@example.com")
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:3000")
    seen = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            seen["timeout"] = timeout

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def starttls(self):
            return None

        def login(self, *args):
            return None

        def send_message(self, *args):
            return None

    monkeypatch.setattr(server.smtplib, "SMTP", FakeSMTP)
    caplog.set_level(logging.INFO, logger="uvicorn.error")
    _run(deliver_reset_email("person@example.com", raw))
    assert seen["timeout"] == 10
    assert raw not in _log_text(caplog)


def test_responses_match_for_known_unknown_and_failed_send(client, monkeypatch, caplog):
    secret = "brevo-key-response-hidden"
    raw = "55" * 16
    monkeypatch.setenv("BREVO_API_KEY", secret)
    monkeypatch.setenv("EMAIL_FROM", "from@example.com")
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:3000")
    monkeypatch.setenv("EXPOSE_RESET_TOKEN", "")
    known = _register(client, "Known")
    _pin_token(monkeypatch, raw)
    caplog.set_level(logging.DEBUG, logger="uvicorn.error")
    with respx.mock:
        respx.post(BREVO_EMAIL_URL).mock(return_value=httpx.Response(201, json={"messageId": "ok"}))
        existing = client.post("/api/auth/forgot-password", json={"email": known})
        unknown = client.post(
            "/api/auth/forgot-password",
            json={"email": f"missing-{uuid.uuid4().hex[:8]}@example.com"},
        )
        respx.post(BREVO_EMAIL_URL).mock(
            return_value=httpx.Response(502, text=raw + secret + "LEAKBODY")
        )
        failed = client.post("/api/auth/forgot-password", json={"email": known})
    assert existing.status_code == 200
    assert existing.content == unknown.content == failed.content
    assert existing.json() == {"message": RESET_EMAIL_MESSAGE}
    assert raw.encode() not in existing.content
    text = _log_text(caplog)
    assert raw not in text
    assert secret not in text
    assert "LEAKBODY" not in text
    assert "brevo status=502" in text
    stored = _resets().find_one({"email": known})
    assert stored["token"] == hash_reset_token(raw)
    assert raw not in stored["token"]


def test_stored_token_is_only_the_hash_and_single_use(client, monkeypatch):
    raw = "66" * 16
    monkeypatch.delenv("BREVO_API_KEY", raising=False)
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.setenv("EXPOSE_RESET_TOKEN", "")
    email = _register(client, "Hash")
    _pin_token(monkeypatch, raw)
    response = client.post("/api/auth/forgot-password", json={"email": email})
    assert response.json() == {"message": RESET_EMAIL_MESSAGE}
    stored = _resets().find_one({"email": email})
    assert stored["token"] == hash_reset_token(raw)
    assert raw not in stored["token"]

    newer = "77" * 16
    _pin_token(monkeypatch, newer)
    again = client.post("/api/auth/forgot-password", json={"email": email})
    assert again.content == response.content
    assert _resets().count_documents({"email": email}) == 1
    assert _resets().find_one({"token": hash_reset_token(raw)}) is None

    old = client.post("/api/auth/reset-password", json={"token": raw, "new_password": "Newpass1!"})
    assert old.status_code == 400
    ok = client.post("/api/auth/reset-password", json={"token": newer, "new_password": "Newpass1!"})
    assert ok.status_code == 200
    used = client.post("/api/auth/reset-password", json={"token": newer, "new_password": "Newpass2!"})
    assert used.status_code == 400


def test_rate_limit_returns_the_generic_body(client, monkeypatch):
    monkeypatch.delenv("BREVO_API_KEY", raising=False)
    monkeypatch.delenv("SMTP_HOST", raising=False)
    email = _register(client, "Limit")
    _clear_limits()
    bodies = []
    for _ in range(4):
        response = client.post("/api/auth/forgot-password", json={"email": email})
        assert response.status_code == 200
        bodies.append(response.content)
    assert len(set(bodies)) == 1
    assert b"429" not in bodies[-1]

    _clear_limits()
    ip_bodies = []
    for index in range(11):
        response = client.post(
            "/api/auth/forgot-password",
            json={"email": f"ip-{index}-{uuid.uuid4().hex[:6]}@example.com"},
        )
        assert response.status_code == 200
        ip_bodies.append(response.content)
    assert len(set(ip_bodies)) == 1
