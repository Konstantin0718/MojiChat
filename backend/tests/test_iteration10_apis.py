"""
Iteration 10 API Tests for MojiChat
Tests:
- Login with konstantin_sabev@abv.bg / Banane.com
- Firebase from env var (firebase_enabled: true)
- Voice upload endpoint
- File upload endpoint  
- Giphy trending and search endpoints
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "konstantin_sabev@abv.bg"
TEST_PASSWORD = "Banane.com"


class TestAuth:
    """Authentication tests"""
    
    def test_login_success(self):
        """Test login with provided credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Token not in response"
        assert "user_id" in data, "user_id not in response"
        assert data["email"] == TEST_EMAIL
        print(f"✓ Login successful for {TEST_EMAIL}, user_id: {data['user_id']}")


class TestFirebase:
    """Firebase integration tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Login failed")
    
    def test_push_subscribe_firebase_enabled(self):
        """Test POST /api/notifications/subscribe returns firebase_enabled: true"""
        response = requests.post(
            f"{BASE_URL}/api/notifications/subscribe",
            json={"endpoint": "test_endpoint", "keys": {"p256dh": "test", "auth": "test"}},
            headers=self.headers
        )
        assert response.status_code == 200, f"Subscribe failed: {response.text}"
        data = response.json()
        assert "firebase_enabled" in data, "firebase_enabled not in response"
        assert data["firebase_enabled"] == True, f"firebase_enabled should be True, got: {data.get('firebase_enabled')}"
        print(f"✓ Firebase Admin SDK is enabled: firebase_enabled={data['firebase_enabled']}")


class TestVoiceUpload:
    """Voice message upload tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Login failed")
    
    def test_voice_upload_endpoint(self):
        """Test POST /api/voice/upload accepts audio_data and duration"""
        # Create a minimal valid base64 audio data (webm header)
        import base64
        # Minimal WebM header bytes
        test_audio = base64.b64encode(b'\x1a\x45\xdf\xa3' + b'\x00' * 100).decode()
        
        response = requests.post(
            f"{BASE_URL}/api/voice/upload",
            json={
                "audio_data": f"data:audio/webm;base64,{test_audio}",
                "duration": 5
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Voice upload failed: {response.text}"
        data = response.json()
        assert "file_url" in data, "file_url not in response"
        assert "file_id" in data, "file_id not in response"
        print(f"✓ Voice upload successful: file_url={data['file_url']}")
    
    def test_voice_upload_requires_audio_data(self):
        """Test POST /api/voice/upload returns 400 without audio_data"""
        response = requests.post(
            f"{BASE_URL}/api/voice/upload",
            json={"duration": 5},
            headers=self.headers
        )
        assert response.status_code == 400, f"Should return 400, got: {response.status_code}"
        print("✓ Voice upload correctly requires audio_data")
    
    def test_voice_upload_requires_auth(self):
        """Test POST /api/voice/upload returns 401 without auth"""
        response = requests.post(
            f"{BASE_URL}/api/voice/upload",
            json={"audio_data": "test", "duration": 5}
        )
        assert response.status_code == 401, f"Should return 401, got: {response.status_code}"
        print("✓ Voice upload correctly requires authentication")


class TestFileUpload:
    """File upload tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            pytest.skip("Login failed")
    
    def test_file_upload_endpoint(self):
        """Test POST /api/upload accepts file"""
        # Create a simple test file
        files = {'file': ('test.txt', b'Hello World Test File', 'text/plain')}
        response = requests.post(
            f"{BASE_URL}/api/upload",
            files=files,
            headers=self.headers
        )
        assert response.status_code == 200, f"File upload failed: {response.text}"
        data = response.json()
        assert "file_url" in data, "file_url not in response"
        assert "file_id" in data, "file_id not in response"
        assert "file_name" in data, "file_name not in response"
        assert "file_type" in data, "file_type not in response"
        print(f"✓ File upload successful: file_url={data['file_url']}, file_type={data['file_type']}")
    
    def test_file_upload_requires_auth(self):
        """Test POST /api/upload returns 401 without auth"""
        files = {'file': ('test.txt', b'test', 'text/plain')}
        response = requests.post(f"{BASE_URL}/api/upload", files=files)
        assert response.status_code == 401, f"Should return 401, got: {response.status_code}"
        print("✓ File upload correctly requires authentication")


class TestGiphy:
    """Giphy API integration tests"""
    
    def test_giphy_trending_returns_gifs(self):
        """Test GET /api/giphy/trending returns GIFs"""
        response = requests.get(f"{BASE_URL}/api/giphy/trending")
        assert response.status_code == 200, f"Giphy trending failed: {response.text}"
        data = response.json()
        assert "gifs" in data, "gifs not in response"
        assert isinstance(data["gifs"], list), "gifs should be a list"
        assert len(data["gifs"]) > 0, "gifs list should not be empty"
        
        # Verify GIF structure
        gif = data["gifs"][0]
        assert "id" in gif, "GIF missing id"
        assert "url" in gif, "GIF missing url"
        assert "preview_url" in gif, "GIF missing preview_url"
        print(f"✓ Giphy trending returned {len(data['gifs'])} GIFs")
    
    def test_giphy_search_returns_gifs(self):
        """Test GET /api/giphy/search?q=cat returns GIFs"""
        response = requests.get(f"{BASE_URL}/api/giphy/search", params={"q": "cat"})
        assert response.status_code == 200, f"Giphy search failed: {response.text}"
        data = response.json()
        assert "gifs" in data, "gifs not in response"
        assert isinstance(data["gifs"], list), "gifs should be a list"
        assert len(data["gifs"]) > 0, "gifs list should not be empty for 'cat' search"
        
        # Verify GIF structure
        gif = data["gifs"][0]
        assert "id" in gif, "GIF missing id"
        assert "url" in gif, "GIF missing url"
        print(f"✓ Giphy search for 'cat' returned {len(data['gifs'])} GIFs")
    
    def test_giphy_search_empty_query(self):
        """Test GET /api/giphy/search with empty query"""
        response = requests.get(f"{BASE_URL}/api/giphy/search", params={"q": ""})
        # Empty query might return trending or error - just check it doesn't crash
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}"
        print(f"✓ Giphy search with empty query handled (status: {response.status_code})")


class TestConversationsAndMessages:
    """Additional conversation tests for verifying chat functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        if response.status_code == 200:
            self.token = response.json().get("token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
            self.user_id = response.json().get("user_id")
        else:
            pytest.skip("Login failed")
    
    def test_get_conversations(self):
        """Test GET /api/conversations"""
        response = requests.get(f"{BASE_URL}/api/conversations", headers=self.headers)
        assert response.status_code == 200, f"Get conversations failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Get conversations returned {len(data)} conversations")
        
        # Return first conversation ID for other tests
        if data:
            return data[0].get("conversation_id")
        return None
    
    def test_get_messages_in_conversation(self):
        """Test GET /api/conversations/{id}/messages"""
        # First get conversations
        conv_response = requests.get(f"{BASE_URL}/api/conversations", headers=self.headers)
        if conv_response.status_code != 200:
            pytest.skip("Could not get conversations")
        
        convs = conv_response.json()
        if not convs:
            pytest.skip("No conversations available")
        
        conv_id = convs[0].get("conversation_id")
        
        # Get messages
        response = requests.get(f"{BASE_URL}/api/conversations/{conv_id}/messages", headers=self.headers)
        assert response.status_code == 200, f"Get messages failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Get messages returned {len(data)} messages from conversation {conv_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
