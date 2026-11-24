"""Stage 0 hotfix: phone flag, hidden tokens, removed debug routes, JWT startup."""
import asyncio
import logging
import os
import subprocess
import sys
import uuid

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
os.environ.setdefault("DB_NAME", "mojichat_stage0_tests")
os.environ.setdefault("JWT_SECRET", "ci_test_secret_long_enough_value")
os.environ["PHONE_AUTH_ENABLED"] = ""

_LOOP = asyncio.new_event_loop()
asyncio.set_event_loop(_LOOP)

import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient

import server


BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VALID_SECRET = "ci_test_secret_long_enough_value"


def _phones():
    client = MongoClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]].phone_verifications


def _email_verifications():
    client = MongoClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]].email_verifications


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as test_client:
        yield test_client


def _register(client, name):
    email = f"{name}-{uuid.uuid4().hex[:8]}@example.com"
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "Test1234!", "name": name},
    )
    assert response.status_code == 200, response.text
    return email


def test_phone_routes_are_hidden_by_default(client, monkeypatch):
    monkeypatch.delenv("PHONE_AUTH_ENABLED", raising=False)
    phone = f"+35988{uuid.uuid4().int % 10000000:07d}"
    sent = client.post("/api/auth/phone/send-code", json={"phone_number": phone})
    verified = client.post(
        "/api/auth/phone/verify",
        json={"phone_number": phone, "verification_code": "000000"},
    )
    assert sent.status_code == 404
    assert verified.status_code == 404
    assert "verification_code" not in sent.text
    assert _phones().find_one({"phone_number": phone}) is None


def test_enabled_phone_auth_does_not_return_or_log_the_code(client, monkeypatch, caplog):
    monkeypatch.setenv("PHONE_AUTH_ENABLED", "true")
    phone = f"+35987{uuid.uuid4().int % 10000000:07d}"
    caplog.set_level(logging.DEBUG)
    sent = client.post("/api/auth/phone/send-code", json={"phone_number": phone})
    assert sent.status_code == 200, sent.text
    assert "verification_code" not in sent.json()
    stored = _phones().find_one({"phone_number": phone})
    assert stored and stored.get("code")
    code = stored["code"]
    assert code not in sent.text
    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert code not in logged

    _phones().database.users.delete_many({"email": None})
    verified = client.post(
        "/api/auth/phone/verify",
        json={"phone_number": phone, "verification_code": code, "name": "Phone User"},
    )
    assert verified.status_code == 200, verified.text
    assert "token" in verified.json()
    assert code not in verified.text


def test_email_verification_token_is_not_returned_or_logged(client, caplog):
    email = _register(client, "Verify")
    caplog.set_level(logging.DEBUG)
    sent = client.post("/api/auth/send-verification", json={"email": email})
    assert sent.status_code == 200, sent.text
    assert "verification_token" not in sent.json()
    stored = _email_verifications().find_one({"email": email})
    assert stored and stored.get("token")
    token = stored["token"]
    assert token not in sent.text
    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert token not in logged

    verified = client.get(f"/api/auth/verify-email/{token}")
    assert verified.status_code == 200, verified.text


def test_debug_routes_are_gone(client):
    assert client.post("/api/notifications/send-push", json={}).status_code == 404
    assert client.post("/api/notifications/send-to-user/user_x", json={}).status_code == 404
    assert client.get("/api/download/code").status_code == 404
    assert client.get("/api/download/full").status_code == 404


def _boot(secret):
    env = os.environ.copy()
    env["JWT_SECRET"] = "" if secret is None else secret
    env["MONGO_URL"] = os.environ.get("MONGO_URL", "mongodb://127.0.0.1:27017")
    env["DB_NAME"] = "mojichat_stage0_boot"
    return subprocess.run(
        [sys.executable, "-c", "import server"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=40,
    )


def test_startup_rejects_a_missing_or_weak_jwt_secret():
    for secret in (None, "default_secret", "short-secret"):
        result = _boot(secret)
        assert result.returncode != 0
        assert "JWT_SECRET" in result.stderr
        assert "at least 32 characters" in result.stderr


def test_startup_accepts_a_long_jwt_secret():
    result = _boot(VALID_SECRET)
    assert result.returncode == 0, result.stderr
