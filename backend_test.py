#!/usr/bin/env python3
"""
MojiChat Backend API Testing Suite
Tests all backend endpoints for the messaging app with emoji conversion
"""

import requests
import json
import time
import sys
from datetime import datetime, timezone

class MojiChatAPITester:
    def __init__(self, base_url="https://emoji-decoder-msg.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.test_user_email = f"test_{int(time.time())}@example.com"
        self.test_user_name = f"Test User {datetime.now().strftime('%H%M%S')}"
        self.test_password = "TestPass123!"
        self.tests_run = 0
        self.tests_passed = 0
        self.conversation_id = None
        self.message_id = None
        self.other_user_id = None

    def log_test(self, test_name, passed, details=""):
        """Log test result"""
        self.tests_run += 1
        if passed:
            self.tests_passed += 1
            print(f"✅ {test_name}")
        else:
            print(f"❌ {test_name} - {details}")

    def make_request(self, method, endpoint, data=None, headers=None, expect_status=200):
        """Make HTTP request with error handling"""
        url = f"{self.base_url}/api/{endpoint}" if not endpoint.startswith('http') else endpoint
        
        if headers is None:
            headers = {'Content-Type': 'application/json'}
        
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)
            
            success = response.status_code == expect_status
            response_data = {}
            
            try:
                response_data = response.json()
            except:
                response_data = {"text": response.text}
                
            return success, response.status_code, response_data
        
        except Exception as e:
            return False, 0, {"error": str(e)}

    def test_health_check(self):
        """Test basic health endpoints"""
        print("\n🔍 Testing Health Checks...")
        
        # Test root endpoint
        success, status, data = self.make_request('GET', '')
        self.log_test("Root endpoint accessible", success, f"Status: {status}")
        
        # Test health endpoint
        success, status, data = self.make_request('GET', 'health')
        self.log_test("Health endpoint responds", success and data.get("status") == "healthy", f"Status: {status}, Response: {data}")

    def test_user_registration(self):
        """Test user registration"""
        print("\n🔍 Testing User Registration...")
        
        user_data = {
            "email": self.test_user_email,
            "password": self.test_password,
            "name": self.test_user_name
        }
        
        success, status, data = self.make_request('POST', 'auth/register', user_data, expect_status=200)
        
        if success and data.get("token"):
            self.token = data["token"]
            self.user_id = data["user_id"]
            self.log_test("User registration successful", True)
        else:
            self.log_test("User registration", False, f"Status: {status}, Response: {data}")

    def test_user_login(self):
        """Test user login with the registered user"""
        print("\n🔍 Testing User Login...")
        
        login_data = {
            "email": self.test_user_email,
            "password": self.test_password
        }
        
        success, status, data = self.make_request('POST', 'auth/login', login_data, expect_status=200)
        
        if success and data.get("token"):
            self.token = data["token"]
            self.user_id = data["user_id"]
            self.log_test("User login successful", True)
        else:
            self.log_test("User login", False, f"Status: {status}, Response: {data}")

    def test_get_current_user(self):
        """Test getting current user info"""
        print("\n🔍 Testing Get Current User...")
        
        if not self.token:
            self.log_test("Get current user", False, "No token available")
            return
            
        success, status, data = self.make_request('GET', 'auth/me')
        
        expected_fields = ["user_id", "email", "name"]
        has_required_fields = all(field in data for field in expected_fields)
        
        self.log_test("Get current user info", success and has_required_fields, f"Status: {status}, Fields: {list(data.keys()) if success else data}")

    def test_user_search(self):
        """Test user search functionality"""
        print("\n🔍 Testing User Search...")
        
        if not self.token:
            self.log_test("User search", False, "No token available")
            return
            
        # Search for a common name
        success, status, data = self.make_request('GET', 'users/search?q=test')
        
        self.log_test("User search endpoint responds", success, f"Status: {status}")
        
        if success:
            # Should return a list
            is_list = isinstance(data, list)
            self.log_test("User search returns list", is_list, f"Type: {type(data)}")

    def test_emoji_conversion(self):
        """Test AI emoji conversion endpoint"""
        print("\n🔍 Testing Emoji Conversion...")
        
        if not self.token:
            self.log_test("Emoji conversion", False, "No token available")
            return
            
        test_text = {"text": "Hello world! How are you today?"}
        success, status, data = self.make_request('POST', 'emoji/convert', test_text)
        
        if success:
            has_required_fields = "original" in data and "emoji" in data
            self.log_test("Emoji conversion successful", has_required_fields, f"Response: {data}")
        else:
            self.log_test("Emoji conversion", False, f"Status: {status}, Response: {data}")

    def test_conversation_creation(self):
        """Test creating conversations"""
        print("\n🔍 Testing Conversation Creation...")
        
        if not self.token:
            self.log_test("Conversation creation", False, "No token available")
            return
            
        # Create a second test user first
        second_user_data = {
            "email": f"test_second_{int(time.time())}@example.com",
            "password": "TestPass456!",
            "name": "Second Test User"
        }
        
        # Register second user (without token for this request)
        temp_token = self.token
        self.token = None
        success, status, data = self.make_request('POST', 'auth/register', second_user_data)
        self.token = temp_token
        
        if success:
            self.other_user_id = data["user_id"]
            
            # Now create a conversation
            conv_data = {
                "participant_ids": [self.other_user_id],
                "is_group": False
            }
            
            success, status, data = self.make_request('POST', 'conversations', conv_data)
            
            if success and data.get("conversation_id"):
                self.conversation_id = data["conversation_id"]
                self.log_test("1-to-1 conversation created", True)
            else:
                self.log_test("1-to-1 conversation creation", False, f"Status: {status}, Response: {data}")
        else:
            self.log_test("Create second user for conversation", False, f"Status: {status}")

    def test_group_conversation(self):
        """Test group conversation creation"""
        print("\n🔍 Testing Group Conversation...")
        
        if not self.token or not self.other_user_id:
            self.log_test("Group conversation", False, "Missing prerequisites")
            return
            
        group_data = {
            "participant_ids": [self.other_user_id],
            "name": "Test Group Chat",
            "is_group": True
        }
        
        success, status, data = self.make_request('POST', 'conversations', group_data)
        
        if success and data.get("conversation_id"):
            group_conv_id = data["conversation_id"]
            self.log_test("Group conversation created", True)
        else:
            self.log_test("Group conversation creation", False, f"Status: {status}, Response: {data}")

    def test_get_conversations(self):
        """Test retrieving conversations list"""
        print("\n🔍 Testing Get Conversations...")
        
        if not self.token:
            self.log_test("Get conversations", False, "No token available")
            return
            
        success, status, data = self.make_request('GET', 'conversations')
        
        if success:
            is_list = isinstance(data, list)
            self.log_test("Get conversations returns list", is_list, f"Type: {type(data)}, Length: {len(data) if is_list else 'N/A'}")
        else:
            self.log_test("Get conversations", False, f"Status: {status}, Response: {data}")

    def test_send_message(self):
        """Test sending messages with emoji conversion"""
        print("\n🔍 Testing Send Message...")
        
        if not self.token or not self.conversation_id:
            self.log_test("Send message", False, "Missing prerequisites (token or conversation)")
            return
            
        message_data = {
            "content": "Hello! This is a test message for emoji conversion."
        }
        
        success, status, data = self.make_request('POST', f'conversations/{self.conversation_id}/messages', message_data)
        
        if success and data.get("message_id"):
            self.message_id = data["message_id"]
            has_emoji = "emoji_content" in data and data["emoji_content"]
            self.log_test("Send message with emoji conversion", has_emoji, f"Emoji: {data.get('emoji_content', 'None')}")
        else:
            self.log_test("Send message", False, f"Status: {status}, Response: {data}")

    def test_get_messages(self):
        """Test retrieving messages"""
        print("\n🔍 Testing Get Messages...")
        
        if not self.token or not self.conversation_id:
            self.log_test("Get messages", False, "Missing prerequisites")
            return
            
        success, status, data = self.make_request('GET', f'conversations/{self.conversation_id}/messages')
        
        if success:
            is_list = isinstance(data, list)
            has_messages = is_list and len(data) > 0
            self.log_test("Get messages returns list with content", has_messages, f"Messages count: {len(data) if is_list else 'N/A'}")
            
            if has_messages:
                msg = data[0]
                has_required_fields = all(field in msg for field in ["message_id", "content", "emoji_content", "sender_id"])
                self.log_test("Message has required fields", has_required_fields, f"Fields: {list(msg.keys())}")
        else:
            self.log_test("Get messages", False, f"Status: {status}, Response: {data}")

    def test_typing_status(self):
        """Test typing status functionality"""
        print("\n🔍 Testing Typing Status...")
        
        if not self.token or not self.conversation_id:
            self.log_test("Typing status", False, "Missing prerequisites")
            return
            
        # Set typing to true
        typing_data = {"is_typing": True}
        success, status, data = self.make_request('POST', f'conversations/{self.conversation_id}/typing', typing_data)
        self.log_test("Set typing status to true", success, f"Status: {status}")
        
        # Get typing status
        success, status, data = self.make_request('GET', f'conversations/{self.conversation_id}/typing')
        is_list = isinstance(data, list)
        self.log_test("Get typing status returns list", success and is_list, f"Status: {status}, Type: {type(data)}")
        
        # Set typing to false
        typing_data = {"is_typing": False}
        success, status, data = self.make_request('POST', f'conversations/{self.conversation_id}/typing', typing_data)
        self.log_test("Set typing status to false", success, f"Status: {status}")

    def test_heartbeat(self):
        """Test user heartbeat for online status"""
        print("\n🔍 Testing Heartbeat...")
        
        if not self.token:
            self.log_test("Heartbeat", False, "No token available")
            return
            
        success, status, data = self.make_request('POST', 'users/heartbeat')
        expected_response = data.get("status") == "ok"
        self.log_test("Heartbeat updates online status", success and expected_response, f"Status: {status}, Response: {data}")

    def test_logout(self):
        """Test user logout"""
        print("\n🔍 Testing Logout...")
        
        if not self.token:
            self.log_test("Logout", False, "No token available")
            return
            
        success, status, data = self.make_request('POST', 'auth/logout')
        self.log_test("Logout successful", success, f"Status: {status}, Response: {data}")

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting MojiChat Backend API Tests...")
        print(f"📡 Backend URL: {self.base_url}")
        print(f"📧 Test User: {self.test_user_email}")
        
        # Core functionality tests
        self.test_health_check()
        self.test_user_registration()
        self.test_user_login()
        self.test_get_current_user()
        
        # Feature tests (require authentication)
        self.test_user_search()
        self.test_emoji_conversion()
        self.test_conversation_creation()
        self.test_group_conversation()
        self.test_get_conversations()
        self.test_send_message()
        self.test_get_messages()
        self.test_typing_status()
        self.test_heartbeat()
        self.test_logout()
        
        # Print summary
        print(f"\n📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"✅ Success Rate: {success_rate:.1f}%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All backend tests passed!")
            return True
        else:
            print("❌ Some backend tests failed. Check the logs above.")
            return False

def main():
    """Main test execution"""
    tester = MojiChatAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())