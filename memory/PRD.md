# MijiChat - PRD (Product Requirements Document)

## Original Problem Statement
Създай ми апп подобен на WhatsApp, Messenger, Viber. В него да може да се пише текст които да се вижда от получателя като емотикони и ако натисне върху тях да му излиза оригиналния текст.

---

## Architecture

### Backend (FastAPI + MongoDB) - COMPLETE ✅
- **Location**: `/app/backend/server.py`
- **API URL**: https://emoji-chat-mobile.preview.emergentagent.com

### Mobile App (React Native / Expo) - COMPLETE ✅
- **Location**: `/app/mobile/`
- **Package**: `com.chatapp.mobile`

---

## Screens Implemented

| Screen | Status | Description |
|--------|--------|-------------|
| LoginScreen | ✅ | Email login + Phone auth + Forgot password |
| RegisterScreen | ✅ | Account creation |
| **ForgotPasswordScreen** | ✅ NEW | Password reset via token |
| **PhoneAuthScreen** | ✅ NEW | Phone number verification/login |
| ConversationsScreen | ✅ | Chat list |
| ChatScreen | ✅ | Messages with voice recording |
| SettingsScreen | ✅ | Profile, theme, push tokens |
| NewChatScreen | ✅ | Start new conversation |
| NewGroupScreen | ✅ | Create group chat |

---

## Authentication Features

### Email/Password ✅
- Register with email
- Login with email
- **Password Reset** (forgot password → email token → new password)
- **Email Verification** (send link → verify email)

### Phone Number ✅
- Send SMS verification code
- Verify code and login/register
- Auto-create account for new phone numbers

### Google OAuth ✅
- Emergent-managed Google Auth integration

---

## Push Notifications - Setup

### SHA-1 Fingerprint (добави в Firebase Console):
```
76:9D:01:8D:1B:38:3F:CB:60:E8:4E:5A:F3:3F:D9:9D:9E:0B:02:59
```

### Стъпки:
1. Firebase Console → Project Settings → Your apps → Android
2. Click "Add fingerprint"
3. Paste SHA-1
4. Save

---

## API Endpoints

### Auth Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Create account |
| `/api/auth/login` | POST | Login |
| `/api/auth/logout` | POST | Logout |
| `/api/auth/me` | GET | Get current user |
| `/api/auth/forgot-password` | POST | Send reset token |
| `/api/auth/reset-password` | POST | Reset with token |
| `/api/auth/send-verification` | POST | Send email verification |
| `/api/auth/verify-email/{token}` | GET | Verify email |
| `/api/auth/phone/send-code` | POST | Send SMS code |
| `/api/auth/phone/verify` | POST | Verify & login |

---

## Build Commands

```bash
# Development
cd /app/mobile && npx expo start

# Build APK (testing)
npx eas build --platform android --profile preview

# Build for Play Store
npx eas build --platform android --profile production
```

---

## Current APK
**URL**: https://expo.dev/artifacts/eas/xhNivpGeA6n4dFQj6o1AL.apk

---

## Changelog

### March 8, 2026 - Auth Improvements
- Added ForgotPasswordScreen with email reset
- Added PhoneAuthScreen with SMS verification
- Added email verification endpoint
- Updated LoginScreen with phone auth button
- SHA-1 fingerprint extracted for Firebase

### December 2025 - Push Notifications
- Added FCM token logging
- Settings screen with token display
- Notification permission request (Android 13+)

---

## Prioritized Backlog

### P0 - Critical ✅ DONE
- Password reset ✅
- Email verification ✅
- Phone authentication ✅

### P1 - High Priority
- [ ] Firebase Phone Auth integration (replace mock SMS)
- [ ] Push notifications working (add SHA-1 to Firebase)
- [ ] Video calls UI

### P2 - Medium Priority
- [ ] Design refresh (user requested)
- [ ] Message forwarding
- [ ] End-to-end encryption

---

## Test Credentials
```
Email: test@example.com
Password: test123

Phone: +359888123456
Code: (shown in dev mode)
```
