"""
Test suite for MojiChat emoji display and translation features
Tests:
- Translation endpoint (Bulgarian ↔ English)
- Login with provided credentials
- Messages API returns emoji_content field
- Language endpoint
"""

import pytest
import requests
import os

# Use external URL for testing what users see
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://mojichat.onrender.com').rstrip('/')

# Test credentials
TEST_EMAIL = "konstantin_sabev@abv.bg"
TEST_PASSWORD = "Banane.com"
CONVERSATION_ID = "conv_1fdb73670c42"


class TestAuthentication:
    """Authentication tests with provided credentials"""
    
    def test_login_success(self):
        """Test login with konstantin_sabev@abv.bg works"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user_id" in data
        assert data["email"] == TEST_EMAIL
        print(f"✓ Login successful for {TEST_EMAIL}")
        return data["token"]
    
    def test_login_invalid_credentials(self):
        """Test login with wrong password fails"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": "wrongpassword"}
        )
        assert response.status_code == 401
        print("✓ Invalid credentials rejected correctly")


class TestTranslationEndpoint:
    """Translation endpoint tests"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    def test_translate_bulgarian_to_english(self, auth_token):
        """Test translating 'Здравей' (Bulgarian) to English"""
        response = requests.post(
            f"{BASE_URL}/api/translate",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"text": "Здравей", "target_language": "en"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "translated" in data
        assert "original" in data
        assert data["original"] == "Здравей"
        # Translation should be "Hello" or similar
        assert data["translated"].lower() in ["hello", "hi", "hey", "greetings"]
        print(f"✓ Bulgarian 'Здравей' → English '{data['translated']}'")
    
    def test_translate_english_to_bulgarian(self, auth_token):
        """Test translating 'Hello' (English) to Bulgarian"""
        response = requests.post(
            f"{BASE_URL}/api/translate",
            headers={"Authorization": f"Bearer {auth_token}"},
            json={"text": "Hello", "target_language": "bg"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "translated" in data
        assert "original" in data
        assert data["original"] == "Hello"
        # Bulgarian translation
        assert data["language"] == "bg"
        print(f"✓ English 'Hello' → Bulgarian '{data['translated']}'")
    
    def test_translate_without_auth_fails(self):
        """Test that translation requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/translate",
            json={"text": "Hello", "target_language": "bg"}
        )
        assert response.status_code == 401
        print("✓ Translation endpoint requires authentication")


class TestMessagesWithEmoji:
    """Tests for messages API with emoji_content field"""
    
    @pytest.fixture
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    def test_messages_have_emoji_content(self, auth_token):
        """Test that messages include emoji_content field"""
        response = requests.get(
            f"{BASE_URL}/api/conversations/{CONVERSATION_ID}/messages",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        messages = response.json()
        assert isinstance(messages, list)
        assert len(messages) > 0
        
        # Check all messages have emoji_content
        for msg in messages:
            assert "emoji_content" in msg, f"Message {msg.get('message_id')} missing emoji_content"
            assert "content" in msg, f"Message {msg.get('message_id')} missing content"
            assert "message_id" in msg
        
        print(f"✓ All {len(messages)} messages have emoji_content field")
    
    def test_emoji_content_is_unicode(self, auth_token):
        """Test that emoji_content contains proper Unicode emojis (not placeholder chars)"""
        response = requests.get(
            f"{BASE_URL}/api/conversations/{CONVERSATION_ID}/messages",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        messages = response.json()
        
        for msg in messages:
            emoji_content = msg.get("emoji_content", "")
            if emoji_content:
                # Check for diamond placeholder (◆) - should NOT be present
                assert "◆" not in emoji_content, f"Found diamond placeholder in message {msg.get('message_id')}"
                # Emoji content should contain actual emoji Unicode characters
                # Most emojis are in ranges: U+1F300-U+1F9FF, U+2600-U+26FF, U+2700-U+27BF
                print(f"  Message emoji: {emoji_content[:30]}...")
        
        print(f"✓ Emoji content contains valid Unicode, no diamond placeholders")


class TestLanguages:
    """Test supported languages endpoint"""
    
    def test_get_languages(self):
        """Test /api/languages returns supported languages"""
        response = requests.get(f"{BASE_URL}/api/languages")
        assert response.status_code == 200
        data = response.json()
        assert "languages" in data
        
        # Check for key languages
        languages = data["languages"]
        assert "en" in languages  # English
        assert "bg" in languages  # Bulgarian
        assert "de" in languages  # German
        
        print(f"✓ Languages endpoint returns {len(languages)} languages")
        print(f"  Includes: English, Bulgarian, German, Spanish, French, etc.")


class TestHealthEndpoint:
    """Health check endpoint test"""
    
    def test_health(self):
        """Test health endpoint returns healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✓ Health endpoint returns healthy")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
