"""Checks that do not call Giphy, an LLM, SMTP, or Firebase."""
import os
import uuid

import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")


def _register(name):
    email = f"{name}-{uuid.uuid4().hex[:8]}@example.com"
    response = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": "Test1234!", "name": name},
        timeout=20,
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_forgot_password_does_not_return_token():
    response = requests.post(
        f"{BASE_URL}/api/auth/forgot-password",
        json={"email": "nobody-ci@example.com"},
        timeout=20,
    )
    assert response.status_code == 200, response.text
    assert "reset_token" not in response.json()


def test_giphy_requires_login():
    response = requests.get(f"{BASE_URL}/api/giphy/trending", timeout=20)
    assert response.status_code == 401, response.text


def test_giphy_without_key_is_unavailable_for_a_user():
    user = _register("GifCi")
    response = requests.get(
        f"{BASE_URL}/api/giphy/search",
        params={"q": "cat"},
        headers={"Authorization": f"Bearer {user['token']}"},
        timeout=20,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["available"] is False
    assert body["results"] == []
    assert body["gifs"] == []


def test_translate_without_key_is_unavailable():
    user = _register("TranslateCi")
    response = requests.post(
        f"{BASE_URL}/api/translate",
        headers={"Authorization": f"Bearer {user['token']}"},
        json={"text": "Hello", "target_language": "bg"},
        timeout=20,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["available"] is False
    assert body["text"] == "Hello"
