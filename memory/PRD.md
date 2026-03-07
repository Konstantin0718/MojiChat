# MijiChat - PRD (Product Requirements Document)

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

### Backend (FastAPI + MongoDB) - COMPLETE ✅
- **Location**: `/app/backend/server.py`
- **Database**: MongoDB with all collections
- **API URL**: https://emoji-chat-mobile.preview.emergentagent.com
- **Features**: 60+ API endpoints for all chat functionality

### Mobile App (React Native / Expo) - COMPLETE ✅
- **Location**: `/app/mobile/`
- **Framework**: Expo SDK 55
- **Language**: TypeScript
- **Navigation**: React Navigation
- **State**: React Context API
- **Firebase**: google-services.json configured

### Project Structure
```
mobile/
├── App.tsx                    # Entry point with navigation
├── app.json                   # Expo config (MijiChat)
├── eas.json                   # Build config for EAS
├── google-services.json       # Firebase config ✅
├── src/
│   ├── components/
│   │   ├── AudioPlayer.tsx    # Voice message playback
│   │   ├── MessageBubble.tsx  # Chat bubbles with emoji reveal
│   │   └── VoiceRecorder.tsx  # Voice recording component
│   ├── config/                # API URL, colors, languages
│   ├── contexts/              # Auth & Theme contexts
│   ├── screens/               # All screens (7 total)
│   ├── services/              # API & notifications
│   └── types/                 # TypeScript types
└── assets/                    # Icons, images
```

---

## Screens Implemented

| Screen | Status | Description |
|--------|--------|-------------|
| LoginScreen | ✅ | Email/password login |
| RegisterScreen | ✅ | Account creation |
| ConversationsScreen | ✅ | Chat list with search, unread counts |
| ChatScreen | ✅ | Messages, voice recording, file attachments |
| SettingsScreen | ✅ | Profile, theme, language settings |
| NewChatScreen | ✅ | Search users, start new conversation |
| NewGroupScreen | ✅ | Create group with multiple members |

---

## Features Implemented

### Core Chat Features ✅
- User authentication (JWT + token storage)
- Conversations list with last message preview
- 1-to-1 and group chats
- AI emoji conversion (GPT-4o via Emergent LLM)
- Tap to reveal original text
- Auto-translation (16 languages)
- Message reactions
- Typing indicators
- Online status
- Read receipts (checkmarks)

### Voice Messages ✅ (NEW)
- Voice recording with animated UI
- Duration timer during recording
- Cancel or send recording
- Audio playback with progress bar
- Waveform visualization

### File Attachments ✅
- Camera capture
- Gallery image picker
- Document picker
- File upload to server

### Mobile-Specific ✅
- Push notification infrastructure (Expo + Firebase)
- Dark/Light theme with system detection
- Secure token storage (AsyncStorage)
- Keyboard-aware views
- Pull to refresh

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

### Firebase Configuration

### Current Setup:
- **Project ID**: `mijichat-7d13c`
- **Android Package**: `com.chatapp.mobile`
- **google-services.json**: ✅ Configured

### Push Notification Testing:
1. Build the app: `npx eas build --platform android --profile preview`
2. Install on physical device
3. Login to the app
4. Check console logs for:
   - `🎉 EXPO PUSH TOKEN OBTAINED!`
   - `🔥 FCM/DEVICE TOKEN OBTAINED!`
5. Go to Settings > "Show Tokens" to see them
6. Test via Firebase Console > Cloud Messaging > "Send test message"

### For iOS (when needed):
1. Go to Firebase Console
2. Add iOS app with Bundle ID: `com.chatapp.mobile`
3. Download `GoogleService-Info.plist`
4. Place in `/app/mobile/`

---

## Changelog

### December 2025 - Voice Messages & Firebase
- Added VoiceRecorder component with animated UI
- Added AudioPlayer component with playback controls
- Integrated file attachment picker (camera, gallery, documents)
- Configured Firebase with google-services.json
- Renamed app to "MijiChat"
- All TypeScript compilation passing

### December 2025 - Initial Mobile App
- Created React Native project structure
- Implemented all 7 screens
- Connected to backend API
- Added MessageBubble with emoji reveal

---

## API Endpoints Summary

### Authentication (4)
- `POST /api/auth/register`, `/login`, `/session`, `/logout`
- `GET /api/auth/me`

### Users (4)
- `GET /api/users/search`, `/api/users/{id}`
- `PUT /api/users/language`
- `POST /api/users/heartbeat`

### Conversations (4)
- `POST /api/conversations`
- `GET /api/conversations`, `/api/conversations/{id}`
- `POST /api/conversations/{id}/members`

### Messages (4)
- `POST /api/conversations/{id}/messages`
- `GET /api/conversations/{id}/messages`
- `POST/GET /api/conversations/{id}/typing`

### Media (4)
- `POST /api/upload`, `/api/voice/upload`
- `GET /api/files/{id}`
- `POST /api/messages/{id}/reactions`

### Calls (6)
- `POST /api/calls/initiate`, `/join`, `/signal`, `/end`
- `GET /api/calls/{id}/signals`, `/api/calls/active`

---

## Prioritized Backlog

### P0 - Critical ✅ DONE
- ~~Voice message recording~~
- ~~File attachments~~
- ~~Firebase configuration~~

### P1 - High Priority
- [ ] Video call UI implementation (WebRTC)
- [ ] Google OAuth in mobile app
- [ ] Phone number registration (Twilio SMS)

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

1. **App Name**: MijiChat (changed from ChatApp)
2. **Firebase**: google-services.json is configured for Android
3. **Backend**: Fully functional with 60+ API endpoints
4. **Emoji Conversion**: Uses GPT-4o via Emergent LLM Key
5. **Voice Messages**: Full recording and playback support
