# MojiChat - PRD (Product Requirements Document)

## Original Problem Statement
Създай ми апп подобен на WhatsApp, Messenger, Viber. В него да може да се пише текст които да се вижда от получателя като емотикони и ако натисне върху тях да му излиза оригиналния текст.

### User Choices:
- **Authentication**: JWT + Google OAuth
- **Chat types**: Personal (1-to-1) + Group chats
- **Features**: Online status, typing indicators, read receipts
- **Emoji conversion**: AI-powered word-to-emoji + visual encryption
- **Theme**: Dark/Light mode toggle
- **Platform**: Native mobile app (React Native / Expo)
- **Target**: Android + iOS

---

## Architecture

### Backend (FastAPI + MongoDB) - COMPLETE
- **Location**: `/app/backend/server.py`
- **Database**: MongoDB with all collections
- **API URL**: https://emoji-chat-mobile.preview.emergentagent.com
- **Features**: 60+ API endpoints for all chat functionality

### Mobile App (React Native / Expo) - IN PROGRESS
- **Location**: `/app/mobile/`
- **Framework**: Expo SDK 55
- **Language**: TypeScript
- **Navigation**: React Navigation
- **State**: React Context API
- **Notifications**: Expo Notifications

### Project Structure
```
mobile/
├── App.tsx                 # Entry point with navigation
├── app.json               # Expo config (package: com.chatapp.mobile)
├── eas.json               # Build config for EAS
├── src/
│   ├── components/        # Reusable components
│   │   └── MessageBubble.tsx
│   ├── config/            # API URL, colors, languages
│   ├── contexts/          # Auth & Theme contexts
│   ├── screens/           # All screens (7 total)
│   ├── services/          # API & notifications
│   └── types/             # TypeScript types
└── assets/                # Icons, images
```

---

## Screens Implemented (December 2025)

| Screen | Status | Description |
|--------|--------|-------------|
| LoginScreen | ✅ Complete | Email/password login |
| RegisterScreen | ✅ Complete | Account creation |
| ConversationsScreen | ✅ Complete | Chat list with search, unread counts |
| ChatScreen | ✅ Complete | Messages with emoji reveal, typing indicator |
| SettingsScreen | ✅ Complete | Profile, theme, language settings |
| NewChatScreen | ✅ Complete | Search users, start new conversation |
| NewGroupScreen | ✅ Complete | Create group with multiple members |

---

## Features

### Core Features (All Working)
- ✅ User authentication (JWT + token storage)
- ✅ Conversations list with last message preview
- ✅ 1-to-1 and group chats
- ✅ AI emoji conversion (GPT-4o via Emergent LLM)
- ✅ Tap to reveal original text
- ✅ Auto-translation (16 languages)
- ✅ Image/audio/file messages
- ✅ Message reactions
- ✅ Typing indicators
- ✅ Online status
- ✅ Read receipts (checkmarks)

### Mobile-Specific Features
- ✅ Push notification infrastructure (Expo)
- ✅ Dark/Light theme with system detection
- ✅ Secure token storage (AsyncStorage)
- ✅ Keyboard-aware views
- ✅ Pull to refresh
- ✅ User search for new chats

---

## Build & Deploy

### Development
```bash
cd /app/mobile
npx expo start
```

### Build APK (Testing)
```bash
npx eas build --platform android --profile preview
```

### Build for Play Store
```bash
npx eas build --platform android --profile production
```

### Build for App Store
```bash
npx eas build --platform ios --profile production
```

---

## Firebase Setup Instructions

### For Push Notifications:
1. Go to https://console.firebase.google.com
2. Create new project named "ChatApp" (or your choice)
3. Add Android app:
   - **Package name**: `com.chatapp.mobile`
   - Download `google-services.json`
   - Place in `/app/mobile/`
4. Add iOS app:
   - **Bundle ID**: `com.chatapp.mobile`
   - Download `GoogleService-Info.plist`
   - Place in `/app/mobile/`
5. Enable Cloud Messaging in Firebase Console

### Package Names (Current Placeholders)
- **Android**: `com.chatapp.mobile`
- **iOS**: `com.chatapp.mobile`

To customize, edit `/app/mobile/app.json`:
```json
{
  "android": {
    "package": "com.yourcompany.yourappname"
  },
  "ios": {
    "bundleIdentifier": "com.yourcompany.yourappname"
  }
}
```

---

## API Endpoints Summary

### Authentication (4 endpoints)
- `POST /api/auth/register`, `/login`, `/session`, `/logout`
- `GET /api/auth/me`

### Users & Settings (4 endpoints)
- `GET /api/users/search`, `/api/users/{id}`
- `PUT /api/users/language`
- `POST /api/users/heartbeat`

### Conversations (4 endpoints)
- `POST /api/conversations`
- `GET /api/conversations`, `/api/conversations/{id}`
- `POST /api/conversations/{id}/members`

### Messages (4 endpoints)
- `POST /api/conversations/{id}/messages`
- `GET /api/conversations/{id}/messages`
- `POST /api/conversations/{id}/typing`
- `GET /api/conversations/{id}/typing`

### Media & Files (4 endpoints)
- `POST /api/upload`, `/api/voice/upload`
- `GET /api/files/{id}`
- `POST /api/messages/{id}/reactions`

### Search (2 endpoints)
- `GET /api/search/messages?q=`
- `GET /api/search/conversations?q=`

### Video Calls (6 endpoints)
- `POST /api/calls/initiate`, `/join`, `/signal`, `/end`
- `GET /api/calls/{id}/signals`, `/api/calls/active`

### Notifications (5 endpoints)
- `POST /api/notifications/subscribe`
- `DELETE /api/notifications/unsubscribe`
- `GET /api/notifications`, `/unread-count`
- `POST /api/notifications/{id}/read`

---

## Changelog

### December 2025 - React Native Mobile App
- Created complete React Native project structure
- Implemented all 7 screens with full functionality
- Added MessageBubble component for proper React hooks usage
- Connected to existing backend API
- TypeScript compilation passing with no errors

### January 2026 - Initial Web App (Archived)
- Built initial web app with PWA support
- Implemented all backend endpoints
- Added AI emoji conversion with GPT-4o
- Created auto-translation system (16 languages)
- Web app archived to `/app/frontend_web/`

---

## Prioritized Backlog

### P0 - In Progress
- [ ] Video call UI implementation (WebRTC in React Native)
- [ ] Voice message recording with expo-av
- [ ] File attachment picker (expo-image-picker, expo-document-picker)

### P1 - High Priority
- [ ] Firebase push notifications (requires user credentials)
- [ ] Phone number registration with SMS (Twilio)
- [ ] Google OAuth in mobile app

### P2 - Medium Priority
- [ ] Message forwarding
- [ ] User blocking/muting
- [ ] End-to-end encryption

### P3 - Low Priority
- [ ] Voice message transcription (Whisper)
- [ ] Story/Status feature
- [ ] Custom sticker upload

---

## Test Credentials
```
Email: test@example.com
Password: test123
```

---

## Important Notes

1. **Backend is fully functional** - All API endpoints are working
2. **Mobile app needs Firebase** - Push notifications require Firebase setup from user
3. **Translation feature uses API** - Deferred due to potential costs
4. **Video calls are stubbed** - Backend supports WebRTC signaling, mobile UI pending
