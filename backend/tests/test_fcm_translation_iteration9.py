"""
Backend tests for Iteration 9 - FCM and Translation features
Tests:
1. Login works with email konstantin_sabev@abv.bg and password Banane.com
2. POST /api/translate translates text correctly (e.g., 'Good morning' to bg should return Bulgarian text)
3. POST /api/notifications/subscribe-fcm endpoint works and accepts fcm_token
4. POST /api/notifications/subscribe returns firebase_enabled: true
5. Firebase Admin SDK is initialized (check /api/notifications/subscribe response)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')
if not BASE_URL:
    BASE_URL = "https://chat-emoji-dev.preview.emergentagent.com"

class TestLoginAndAuth:
    """Test login functionality"""
    
    def test_login_with_credentials(self):
        """Test login with provided credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "konstantin_sabev@abv.bg",
            "password": "Banane.com"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user_id" in data, "Response should contain user_id"
        assert data["email"] == "konstantin_sabev@abv.bg", "Email should match"
        print(f"✓ Login successful, user_id: {data['user_id']}")
        return data


class TestTranslationAPI:
    """Test translation endpoint"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "konstantin_sabev@abv.bg",
            "password": "Banane.com"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    def test_translate_to_bulgarian(self, auth_token):
        """Test translating 'Good morning' to Bulgarian"""
        response = requests.post(
            f"{BASE_URL}/api/translate",
            json={"text": "Good morning", "target_language": "bg"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Translation failed: {response.text}"
        
        data = response.json()
        assert "translated" in data, "Response should contain translated text"
        assert "original" in data, "Response should contain original text"
        assert data["original"] == "Good morning", "Original text should match"
        assert data["language"] == "bg", "Language should be 'bg'"
        # Bulgarian for "Good morning" contains Cyrillic
        assert any(0x0400 <= ord(c) <= 0x04FF for c in data["translated"]), \
            f"Translated text should contain Cyrillic characters: {data['translated']}"
        print(f"✓ Translated 'Good morning' to Bulgarian: {data['translated']}")
    
    def test_translate_to_german(self, auth_token):
        """Test translating 'Good morning' to German"""
        response = requests.post(
            f"{BASE_URL}/api/translate",
            json={"text": "Good morning", "target_language": "de"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Translation failed: {response.text}"
        
        data = response.json()
        assert "translated" in data
        assert data["language"] == "de"
        # German "Good morning" is "Guten Morgen"
        print(f"✓ Translated 'Good morning' to German: {data['translated']}")
    
    def test_translate_requires_auth(self):
        """Test that translation requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/translate",
            json={"text": "Hello", "target_language": "bg"}
        )
        assert response.status_code == 401, "Translation should require authentication"
        print("✓ Translation requires authentication (401 without token)")


class TestFCMEndpoints:
    """Test Firebase Cloud Messaging endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "konstantin_sabev@abv.bg",
            "password": "Banane.com"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    def test_subscribe_push_returns_firebase_enabled(self, auth_token):
        """Test POST /api/notifications/subscribe returns firebase_enabled: true"""
        response = requests.post(
            f"{BASE_URL}/api/notifications/subscribe",
            json={
                "endpoint": "https://test-push-service.com/test-endpoint",
                "keys": {
                    "auth": "test-auth-key",
                    "p256dh": "test-p256dh-key"
                }
            },
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Subscribe failed: {response.text}"
        
        data = response.json()
        assert "status" in data, "Response should contain status"
        assert data["status"] == "subscribed", "Status should be 'subscribed'"
        assert "firebase_enabled" in data, "Response should contain firebase_enabled"
        assert data["firebase_enabled"] == True, "firebase_enabled should be True"
        print(f"✓ Push subscribe works, firebase_enabled: {data['firebase_enabled']}")
    
    def test_subscribe_fcm_endpoint(self, auth_token):
        """Test POST /api/notifications/subscribe-fcm accepts fcm_token"""
        response = requests.post(
            f"{BASE_URL}/api/notifications/subscribe-fcm",
            json={"fcm_token": "test-fcm-device-token-12345"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"FCM subscribe failed: {response.text}"
        
        data = response.json()
        assert "status" in data, "Response should contain status"
        assert data["status"] == "subscribed", "Status should be 'subscribed'"
        assert "token_type" in data, "Response should contain token_type"
        assert data["token_type"] == "fcm", "token_type should be 'fcm'"
        print(f"✓ FCM subscribe works, token_type: {data['token_type']}")
    
    def test_subscribe_fcm_requires_token(self, auth_token):
        """Test FCM subscribe requires fcm_token"""
        response = requests.post(
            f"{BASE_URL}/api/notifications/subscribe-fcm",
            json={},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 400, "Should fail without fcm_token"
        assert "fcm_token" in response.text.lower(), "Error should mention fcm_token"
        print("✓ FCM subscribe requires fcm_token (400 without token)")
    
    def test_subscribe_fcm_requires_auth(self):
        """Test FCM subscribe requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/notifications/subscribe-fcm",
            json={"fcm_token": "test-token"}
        )
        assert response.status_code == 401, "Should require authentication"
        print("✓ FCM subscribe requires authentication (401 without token)")


class TestLanguageEndpoints:
    """Test language-related endpoints"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "konstantin_sabev@abv.bg",
            "password": "Banane.com"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    def test_get_supported_languages(self):
        """Test GET /api/languages returns supported languages"""
        response = requests.get(f"{BASE_URL}/api/languages")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "languages" in data, "Response should contain languages"
        languages = data["languages"]
        assert "bg" in languages, "Bulgarian should be supported"
        assert "en" in languages, "English should be supported"
        assert "de" in languages, "German should be supported"
        print(f"✓ Languages endpoint works, {len(languages)} languages available")
    
    def test_update_user_language(self, auth_token):
        """Test PUT /api/users/language updates language"""
        response = requests.put(
            f"{BASE_URL}/api/users/language",
            json={"preferred_language": "de"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert data["preferred_language"] == "de"
        print("✓ Language updated to German")
        
        # Reset to Bulgarian
        response = requests.put(
            f"{BASE_URL}/api/users/language",
            json={"preferred_language": "bg"},
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200
        print("✓ Language reset to Bulgarian")
    
    def test_get_user_preferred_language(self, auth_token):
        """Test GET /api/auth/me returns preferred_language"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "preferred_language" in data, "Response should contain preferred_language"
        print(f"✓ User preferred_language: {data['preferred_language']}")


class TestConversationEndpoints:
    """Test conversation endpoints for message translation context"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "konstantin_sabev@abv.bg",
            "password": "Banane.com"
        })
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Authentication failed")
    
    def test_get_conversations(self, auth_token):
        """Test GET /api/conversations returns user's conversations"""
        response = requests.get(
            f"{BASE_URL}/api/conversations",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Got {len(data)} conversations")
        
        if len(data) > 0:
            conv = data[0]
            assert "conversation_id" in conv, "Conversation should have ID"
            print(f"  First conversation: {conv.get('name') or 'unnamed'}")
            return conv["conversation_id"]
        return None
    
    def test_get_messages(self, auth_token):
        """Test GET /api/conversations/{id}/messages returns messages"""
        # First get conversations
        conv_response = requests.get(
            f"{BASE_URL}/api/conversations",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        if conv_response.status_code == 200 and len(conv_response.json()) > 0:
            conv_id = conv_response.json()[0]["conversation_id"]
            
            response = requests.get(
                f"{BASE_URL}/api/conversations/{conv_id}/messages",
                headers={"Authorization": f"Bearer {auth_token}"}
            )
            assert response.status_code == 200, f"Failed: {response.text}"
            
            data = response.json()
            assert isinstance(data, list), "Response should be a list"
            print(f"✓ Got {len(data)} messages from conversation {conv_id}")
            
            if len(data) > 0:
                msg = data[0]
                assert "message_id" in msg, "Message should have ID"
                assert "content" in msg, "Message should have content"
                if msg.get("emoji_content"):
                    print(f"  Message has emoji_content: {msg['emoji_content'][:30]}...")
        else:
            pytest.skip("No conversations available")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
