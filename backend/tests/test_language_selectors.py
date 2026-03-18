"""
Test file for MojiChat Language Selectors Feature
Tests the translation language selector (chat header) and UI language selector (settings)

Features tested:
- Login with email/password
- Translation endpoint POST /api/translate
- User language update PUT /api/users/language  
- Languages list GET /api/languages
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://chat-emoji-dev.preview.emergentagent.com')

# Test credentials
TEST_EMAIL = "konstantin_sabev@abv.bg"
TEST_PASSWORD = "Banane.com"


class TestAuthentication:
    """Login and auth tests"""
    
    token = None
    
    def test_login_success(self):
        """Test login with valid credentials returns token"""
        response = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "No token in response"
        assert "user_id" in data, "No user_id in response"
        assert data["email"] == TEST_EMAIL
        
        # Store token for other tests
        TestAuthentication.token = data["token"]
        print(f"Login successful for {TEST_EMAIL}")


class TestTranslationLanguage:
    """Tests for translation language selector (chat header)"""
    
    def get_auth_headers(self):
        return {"Authorization": f"Bearer {TestAuthentication.token}"}
    
    def test_translate_to_bulgarian(self):
        """Translation with target_language='bg' returns Bulgarian text"""
        response = requests.post(
            f"{BASE_URL}/api/translate",
            headers=self.get_auth_headers(),
            json={"text": "Hello, how are you?", "target_language": "bg"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "translated" in data
        assert data["language"] == "bg"
        # Bulgarian text should contain Cyrillic characters
        translated = data["translated"]
        has_cyrillic = any('\u0400' <= c <= '\u04FF' for c in translated)
        assert has_cyrillic, f"Translation not in Bulgarian: {translated}"
        print(f"Translated to Bulgarian: {translated}")
    
    def test_translate_to_german(self):
        """Translation with target_language='de' returns German text"""
        response = requests.post(
            f"{BASE_URL}/api/translate",
            headers=self.get_auth_headers(),
            json={"text": "Hello friend", "target_language": "de"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["language"] == "de"
        print(f"Translated to German: {data['translated']}")
    
    def test_translate_to_english(self):
        """Translation with target_language='en' returns English text"""
        response = requests.post(
            f"{BASE_URL}/api/translate",
            headers=self.get_auth_headers(),
            json={"text": "Здравей, как си?", "target_language": "en"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["language"] == "en"
        print(f"Translated to English: {data['translated']}")
    
    def test_translate_requires_auth(self):
        """Translation endpoint requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/translate",
            json={"text": "Hello", "target_language": "bg"}
        )
        assert response.status_code == 401


class TestUILanguage:
    """Tests for UI language selector (settings)"""
    
    def get_auth_headers(self):
        return {"Authorization": f"Bearer {TestAuthentication.token}"}
    
    def test_get_supported_languages(self):
        """GET /api/languages returns list of supported languages"""
        response = requests.get(f"{BASE_URL}/api/languages")
        assert response.status_code == 200
        
        data = response.json()
        assert "languages" in data
        
        languages = data["languages"]
        # Check expected languages are present
        expected = ["en", "bg", "de", "es", "fr", "ru"]
        for lang in expected:
            assert lang in languages, f"Missing language: {lang}"
        
        print(f"Supported languages: {list(languages.keys())}")
    
    def test_update_user_language_to_german(self):
        """PUT /api/users/language updates user's UI language preference"""
        response = requests.put(
            f"{BASE_URL}/api/users/language",
            headers=self.get_auth_headers(),
            json={"preferred_language": "de"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["preferred_language"] == "de"
        print("Updated UI language to German")
    
    def test_update_user_language_to_bulgarian(self):
        """PUT /api/users/language updates user's UI language back to Bulgarian"""
        response = requests.put(
            f"{BASE_URL}/api/users/language",
            headers=self.get_auth_headers(),
            json={"preferred_language": "bg"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["preferred_language"] == "bg"
        print("Updated UI language to Bulgarian")
    
    def test_user_language_persists(self):
        """GET /api/auth/me returns user's current language preference"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=self.get_auth_headers()
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "preferred_language" in data
        assert data["preferred_language"] == "bg"
        print(f"User language preference: {data['preferred_language']}")
    
    def test_invalid_language_rejected(self):
        """PUT /api/users/language rejects invalid language codes"""
        response = requests.put(
            f"{BASE_URL}/api/users/language",
            headers=self.get_auth_headers(),
            json={"preferred_language": "invalid_lang"}
        )
        assert response.status_code == 400


class TestConversations:
    """Tests for conversation access"""
    
    def get_auth_headers(self):
        return {"Authorization": f"Bearer {TestAuthentication.token}"}
    
    def test_get_conversations(self):
        """GET /api/conversations returns user's conversations"""
        response = requests.get(
            f"{BASE_URL}/api/conversations",
            headers=self.get_auth_headers()
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0, "User should have conversations"
        
        # Check Yordan conversation exists
        yordan_conv = next(
            (c for c in data if any(
                'Yordan' in p.get('name', '') for p in c.get('participants', [])
            )),
            None
        )
        assert yordan_conv is not None, "Yordan conversation not found"
        print(f"Found {len(data)} conversations including Yordan")
    
    def test_get_messages_from_yordan_chat(self):
        """GET /api/conversations/{id}/messages returns messages"""
        # First get conversations
        conv_response = requests.get(
            f"{BASE_URL}/api/conversations",
            headers=self.get_auth_headers()
        )
        conversations = conv_response.json()
        
        # Find Yordan's conversation
        yordan_conv = next(
            (c for c in conversations if any(
                'Yordan' in p.get('name', '') for p in c.get('participants', [])
            )),
            None
        )
        
        if yordan_conv:
            conv_id = yordan_conv['conversation_id']
            msg_response = requests.get(
                f"{BASE_URL}/api/conversations/{conv_id}/messages",
                headers=self.get_auth_headers()
            )
            assert msg_response.status_code == 200
            
            messages = msg_response.json()
            assert isinstance(messages, list)
            assert len(messages) > 0, "Should have messages in Yordan chat"
            
            # Check message structure
            msg = messages[0]
            assert "message_id" in msg
            assert "content" in msg
            assert "emoji_content" in msg
            print(f"Yordan chat has {len(messages)} messages")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
