#!/usr/bin/env python3
"""
MojiChat Backend API Tests - Message Ordering Fix Verification
Tests for the bug fix: chat messages should be returned in chronological order (oldest first)
"""

import pytest
import requests
import os
import time
from datetime import datetime

# Get BASE_URL from environment - uses the public preview URL
BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials (existing users with conversation)
TEST_USER_1_EMAIL = "test1@mojichat.com"
TEST_USER_1_PASSWORD = "Test1234!"
TEST_USER_2_EMAIL = "test2@mojichat.com"  
TEST_USER_2_PASSWORD = "Test1234!"

class TestMessageOrdering:
    """Tests for message ordering bug fix - messages should be oldest-first (chronological)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.base_url = BASE_URL
        self.token = None
        self.user_id = None
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def login_user(self, email, password):
        """Login and get token"""
        response = self.session.post(
            f"{self.base_url}/api/auth/login",
            json={"email": email, "password": password}
        )
        if response.status_code == 200:
            data = response.json()
            self.token = data.get("token")
            self.user_id = data.get("user_id")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            return data
        return None
        
    def test_login_test_user_1(self):
        """Test that test user 1 can login"""
        result = self.login_user(TEST_USER_1_EMAIL, TEST_USER_1_PASSWORD)
        assert result is not None, "Login should succeed"
        assert "token" in result, "Response should contain token"
        assert "user_id" in result, "Response should contain user_id"
        print(f"✅ Test user 1 logged in: {result['user_id']}")
        
    def test_get_conversations_returns_list(self):
        """Test that conversations endpoint returns a list"""
        self.login_user(TEST_USER_1_EMAIL, TEST_USER_1_PASSWORD)
        
        response = self.session.get(f"{self.base_url}/api/conversations")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Conversations should be a list"
        print(f"✅ Found {len(data)} conversations")
        
    def test_messages_in_chronological_order(self):
        """
        CRITICAL BUG FIX TEST: Messages should be returned in chronological order (oldest first)
        The backend sorts by created_at DESC and then reverses the result.
        """
        self.login_user(TEST_USER_1_EMAIL, TEST_USER_1_PASSWORD)
        
        # Get conversations
        response = self.session.get(f"{self.base_url}/api/conversations")
        assert response.status_code == 200
        conversations = response.json()
        
        if len(conversations) == 0:
            pytest.skip("No conversations available - need to create test data first")
            
        # Get first conversation with messages
        conv_id = conversations[0]["conversation_id"]
        
        # Get messages for this conversation
        response = self.session.get(f"{self.base_url}/api/conversations/{conv_id}/messages")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        messages = response.json()
        print(f"Found {len(messages)} messages in conversation {conv_id}")
        
        if len(messages) < 2:
            pytest.skip("Need at least 2 messages to verify ordering")
        
        # Verify messages are in chronological order (oldest first)
        for i in range(1, len(messages)):
            prev_time = messages[i-1].get("created_at", "")
            curr_time = messages[i].get("created_at", "")
            
            assert prev_time <= curr_time, (
                f"Messages should be in chronological order (oldest first). "
                f"Message {i-1} ({prev_time}) should be before message {i} ({curr_time})"
            )
            
        print(f"✅ All {len(messages)} messages are in correct chronological order (oldest first)")
        print(f"   First message: {messages[0].get('created_at')}")
        print(f"   Last message: {messages[-1].get('created_at')}")
        
    def test_send_message_and_verify_order(self):
        """Test that a newly sent message appears at the end (newest = bottom)"""
        self.login_user(TEST_USER_1_EMAIL, TEST_USER_1_PASSWORD)
        
        # Get conversations
        response = self.session.get(f"{self.base_url}/api/conversations")
        assert response.status_code == 200
        conversations = response.json()
        
        if len(conversations) == 0:
            pytest.skip("No conversations available")
            
        conv_id = conversations[0]["conversation_id"]
        
        # Get messages before sending
        response = self.session.get(f"{self.base_url}/api/conversations/{conv_id}/messages")
        messages_before = response.json()
        
        # Send a new message
        test_content = f"Test message at {datetime.now().isoformat()}"
        response = self.session.post(
            f"{self.base_url}/api/conversations/{conv_id}/messages",
            json={"content": test_content, "message_type": "text"}
        )
        
        assert response.status_code == 200, f"Send message failed: {response.status_code}"
        sent_message = response.json()
        
        # Get messages after sending
        response = self.session.get(f"{self.base_url}/api/conversations/{conv_id}/messages")
        messages_after = response.json()
        
        # Verify new message is at the END (newest at bottom)
        assert len(messages_after) > len(messages_before), "Message count should increase"
        
        last_message = messages_after[-1]
        assert last_message["message_id"] == sent_message["message_id"], (
            f"Newly sent message should be at the end (bottom). "
            f"Expected {sent_message['message_id']}, got {last_message['message_id']}"
        )
        
        print(f"✅ New message correctly appears at the bottom (newest last)")
        print(f"   Message ID: {sent_message['message_id']}")


class TestAuthEndpoints:
    """Test authentication endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def test_login_valid_credentials(self):
        """Test login with valid credentials"""
        response = self.session.post(
            f"{self.base_url}/api/auth/login",
            json={"email": TEST_USER_1_EMAIL, "password": TEST_USER_1_PASSWORD}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert "user_id" in data, "Response should contain user_id"
        assert data["email"] == TEST_USER_1_EMAIL
        print(f"✅ Login successful for {TEST_USER_1_EMAIL}")
        
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = self.session.post(
            f"{self.base_url}/api/auth/login",
            json={"email": "wrong@example.com", "password": "wrongpassword"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Invalid credentials correctly rejected")
        
    def test_register_duplicate_email(self):
        """Test that duplicate email registration fails"""
        response = self.session.post(
            f"{self.base_url}/api/auth/register",
            json={
                "email": TEST_USER_1_EMAIL,  # Already exists
                "password": "TestPassword123!",
                "name": "Duplicate User"
            }
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✅ Duplicate email registration correctly rejected")
        
    def test_get_me_authenticated(self):
        """Test /auth/me endpoint with valid token"""
        # Login first
        login_response = self.session.post(
            f"{self.base_url}/api/auth/login",
            json={"email": TEST_USER_1_EMAIL, "password": TEST_USER_1_PASSWORD}
        )
        token = login_response.json()["token"]
        
        # Get user info
        response = self.session.get(
            f"{self.base_url}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == TEST_USER_1_EMAIL
        print(f"✅ /auth/me returns correct user info")


class TestConversationEndpoints:
    """Test conversation CRUD endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login
        response = self.session.post(
            f"{self.base_url}/api/auth/login",
            json={"email": TEST_USER_1_EMAIL, "password": TEST_USER_1_PASSWORD}
        )
        if response.status_code == 200:
            self.token = response.json()["token"]
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
            
    def test_get_conversations(self):
        """Test getting user's conversations"""
        response = self.session.get(f"{self.base_url}/api/conversations")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        if len(data) > 0:
            conv = data[0]
            assert "conversation_id" in conv
            assert "participants" in conv
            print(f"✅ Found {len(data)} conversations")
        else:
            print("✅ Conversations endpoint works (empty list)")
            
    def test_get_specific_conversation(self):
        """Test getting a specific conversation by ID"""
        # Get conversations list first
        response = self.session.get(f"{self.base_url}/api/conversations")
        conversations = response.json()
        
        if len(conversations) == 0:
            pytest.skip("No conversations to test")
            
        conv_id = conversations[0]["conversation_id"]
        
        # Get specific conversation
        response = self.session.get(f"{self.base_url}/api/conversations/{conv_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["conversation_id"] == conv_id
        print(f"✅ Got conversation details for {conv_id}")


class TestHealthEndpoints:
    """Test health check endpoints"""
    
    def test_api_root(self):
        """Test API root endpoint"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        print("✅ API root endpoint accessible")
        
    def test_health_endpoint(self):
        """Test health endpoint"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data.get("status") == "healthy"
        print("✅ Health endpoint returns healthy status")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
