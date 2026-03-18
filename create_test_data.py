#!/usr/bin/env python3
"""
Complete MojiChat E2E Test - Creates users, conversation, and tests emoji functionality
"""

import requests
import time
import json

def create_test_users_and_conversation():
    """Create test users and a conversation, return session info"""
    base_url = "https://chat-emoji-dev.preview.emergentagent.com/api"
    
    # Create first user
    timestamp = int(time.time())
    user1_data = {
        "email": f"emoji_test_user1_{timestamp}@example.com",
        "password": "TestPass123!",
        "name": f"Emoji User 1 {timestamp}"
    }
    
    response1 = requests.post(f"{base_url}/auth/register", json=user1_data)
    if response1.status_code != 200:
        print(f"Failed to create user 1: {response1.text}")
        return None
        
    user1_info = response1.json()
    user1_token = user1_info["token"]
    user1_id = user1_info["user_id"]
    
    print(f"✅ Created User 1: {user1_data['email']}")
    
    # Create second user  
    user2_data = {
        "email": f"emoji_test_user2_{timestamp}@example.com",
        "password": "TestPass456!",
        "name": f"Emoji User 2 {timestamp}"
    }
    
    response2 = requests.post(f"{base_url}/auth/register", json=user2_data)
    if response2.status_code != 200:
        print(f"Failed to create user 2: {response2.text}")
        return None
        
    user2_info = response2.json()
    user2_token = user2_info["token"]
    user2_id = user2_info["user_id"]
    
    print(f"✅ Created User 2: {user2_data['email']}")
    
    # Create conversation between users (as user 1)
    headers = {'Authorization': f'Bearer {user1_token}', 'Content-Type': 'application/json'}
    conv_data = {
        "participant_ids": [user2_id],
        "is_group": False
    }
    
    response3 = requests.post(f"{base_url}/conversations", json=conv_data, headers=headers)
    if response3.status_code != 200:
        print(f"Failed to create conversation: {response3.text}")
        return None
        
    conv_info = response3.json()
    conversation_id = conv_info["conversation_id"]
    
    print(f"✅ Created conversation: {conversation_id}")
    
    # Send a test message with emoji conversion
    message_data = {"content": "Hello! This is a test message that should be converted to emojis. How are you doing today?"}
    response4 = requests.post(f"{base_url}/conversations/{conversation_id}/messages", 
                             json=message_data, headers=headers)
    
    if response4.status_code == 200:
        message_info = response4.json()
        print(f"✅ Sent test message with emoji: {message_info.get('emoji_content', 'No emoji')}")
    else:
        print(f"Failed to send message: {response4.text}")
    
    return {
        "user1": {
            "email": user1_data["email"],
            "password": user1_data["password"],
            "name": user1_data["name"],
            "token": user1_token,
            "user_id": user1_id
        },
        "user2": {
            "email": user2_data["email"],
            "password": user2_data["password"],
            "name": user2_data["name"],
            "token": user2_token,
            "user_id": user2_id
        },
        "conversation_id": conversation_id
    }

if __name__ == "__main__":
    result = create_test_users_and_conversation()
    if result:
        # Save to file for use by Playwright test
        with open("/app/test_conversation_data.json", "w") as f:
            json.dump(result, f, indent=2)
        print("🎉 Test data saved to /app/test_conversation_data.json")
    else:
        print("❌ Failed to create test data")