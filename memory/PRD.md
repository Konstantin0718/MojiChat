# MojiChat - PRD (Product Requirements Document)

## Original Problem Statement
Създай ми апп подобен на WhatsApp, Messenger, Viber. В него да може да се пише текст които да се вижда от получателя като емотикони и ако натисне върху тях да му излиза оригиналния текст.

### User Choices:
- **Authentication**: JWT + Google OAuth
- **Chat types**: Personal (1-to-1) + Group chats
- **Features**: Online status, typing indicators, read receipts
- **Emoji conversion**: AI-powered word-to-emoji + visual encryption
- **Theme**: Dark/Light mode toggle
- **Additional features (Phase 2)**:
  - Voice messages (browser recording)
  - File/image/video upload
  - Interactive emojis, stickers, GIFs
  - Auto-translation (16 languages)
  - Language preference settings
- **Additional features (Phase 3)**:
  - Video/Audio calls (WebRTC) - 1-to-1 + group up to 6
  - Message search
  - Push notifications
  - PWA (Progressive Web App) - installable on mobile/desktop

---

## Architecture

### Backend (FastAPI + MongoDB)
- **server.py**: Main API with all endpoints
- **Database**: MongoDB with collections:
  - `users`: User profiles with language preferences
  - `user_sessions`: OAuth sessions
  - `conversations`: Chat conversations (1-to-1 & groups)
  - `messages`: Messages with emoji content, translations, reactions
  - `typing_status`: Real-time typing indicators
  - `calls`: Video/audio call sessions
  - `call_signals`: WebRTC signaling data
  - `notifications`: Push notifications
  - `push_subscriptions`: Push subscription endpoints

### Frontend (React + Tailwind + Shadcn/UI)
- **Contexts**: ThemeContext, AuthContext
- **Pages**: LandingPage, LoginPage, RegisterPage, AuthCallback
- **Components**:
  - `ChatLayout`: Main chat interface
  - `EmojiRevealCard`: Message bubble with reveal animation
  - `TypingIndicator`: Animated typing dots
  - `VoiceRecorder`: Browser-based audio recording
  - `FileUploader`: Multi-type file upload
  - `EmojiPicker`: Emojis, Stickers, GIFs tabs
  - `LanguageSelector`: 16 language options
  - `VideoCall`: WebRTC video/audio call interface
  - `SearchDialog`: Message and conversation search
  - `InstallPrompt`: PWA install prompt
  - `NotificationManager`: Push notification settings

### PWA Features
- Service Worker for offline support
- Web App Manifest for installation
- Push notification infrastructure
- 8 app icons (72-512px)
- Installable on Android, iOS, Desktop

### Integrations
- **Emergent Auth**: Google OAuth
- **Emergent LLM (GPT-4o)**: Text-to-emoji conversion & translation
- **WebRTC**: Peer-to-peer video/audio calls

---

## What's Been Implemented

### January 5, 2026 - Initial MVP
- Complete authentication flow (JWT + Google OAuth)
- Chat interface with emoji conversion
- Real-time messaging with polling
- Online status & typing indicators
- Dark/Light theme toggle

### January 5, 2026 - Phase 2 Features
- Voice message recording & playback
- File upload (images, videos, documents)
- Enhanced emoji picker with Stickers/GIFs tabs
- Message reactions
- Auto-translation to 16 languages
- Language preference settings per user
- Animated emoji display

### January 5, 2026 - Phase 3 Features
- Video calls (WebRTC) - 1-to-1 + group
- Audio calls
- Message search (Cmd+K shortcut)
- Conversation search
- Push notification infrastructure
- PWA support (manifest, service worker, icons)
- Install prompt for mobile/desktop

---

## API Endpoints (60+ endpoints)

### Authentication
- `POST /api/auth/register`, `/login`, `/session`, `/logout`
- `GET /api/auth/me`

### Users & Settings
- `GET /api/users/search`, `/api/users/{id}`
- `PUT /api/users/language`
- `POST /api/users/heartbeat`

### Conversations
- `POST /api/conversations`
- `GET /api/conversations`, `/api/conversations/{id}`
- `POST /api/conversations/{id}/members`

### Messages
- `POST /api/conversations/{id}/messages`
- `GET /api/conversations/{id}/messages`
- `POST /api/conversations/{id}/typing`

### Media & Files
- `POST /api/upload`, `/api/voice/upload`
- `GET /api/files/{id}`
- `POST /api/messages/{id}/reactions`

### Search
- `GET /api/search/messages?q=`
- `GET /api/search/conversations?q=`

### Video Calls
- `POST /api/calls/initiate`
- `POST /api/calls/{id}/join`, `/signal`, `/end`
- `GET /api/calls/{id}/signals`
- `GET /api/calls/active`

### Notifications
- `POST /api/notifications/subscribe`
- `DELETE /api/notifications/unsubscribe`
- `GET /api/notifications`, `/unread-count`
- `POST /api/notifications/{id}/read`

### Utilities
- `GET /api/languages`, `/stickers`, `/animated-emojis`
- `POST /api/translate`, `/emoji/convert`

---

## Prioritized Backlog

### P0 - Critical (Next Sprint)
- [ ] Phone number registration with SMS verification (Twilio)

### P1 - High Priority
- [ ] Message forwarding
- [ ] User blocking/muting
- [ ] End-to-end encryption

### P2 - Medium Priority
- [ ] Voice message transcription (Whisper)
- [ ] Story/Status feature
- [ ] Custom sticker upload
- [ ] Firebase push notifications (production keys)

### P3 - Low Priority
- [ ] Message scheduling
- [ ] Polls in groups
- [ ] Location sharing
- [ ] Contact sharing

---

## Next Tasks

1. **Firebase Setup**: Add production Firebase keys for push notifications
2. **Phone Registration**: Integrate Twilio for SMS verification
3. **E2E Encryption**: Add Signal Protocol for message encryption
4. **Performance**: Message pagination and lazy loading
5. **Testing**: Comprehensive WebRTC testing across browsers
