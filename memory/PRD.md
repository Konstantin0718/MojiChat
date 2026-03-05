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

### Integrations
- **Emergent Auth**: Google OAuth
- **Emergent LLM (GPT-4o)**: Text-to-emoji conversion & translation

---

## User Personas

1. **Privacy-Conscious User**: Wants fun messaging but doesn't want text visible at a glance
2. **International User**: Communicates with people in different languages
3. **Social Group Admin**: Creates and manages group chats
4. **Media Sharer**: Sends photos, videos, voice messages

---

## Core Requirements (Static)

### Must Have (P0)
- [x] User registration & login (email/password)
- [x] Google OAuth integration
- [x] 1-to-1 private messaging
- [x] Group chat creation
- [x] AI text-to-emoji conversion
- [x] Tap to reveal original text
- [x] Online/offline status
- [x] Dark/Light theme toggle

### Should Have (P1)
- [x] Read receipts
- [x] Typing indicators
- [x] Voice messages
- [x] File/image/video upload
- [x] Message reactions
- [x] Auto-translation
- [x] Language preferences

### Nice to Have (P2)
- [x] Interactive animated emojis
- [x] Stickers & GIF-like emojis
- [ ] Phone number registration (requires Twilio)
- [ ] End-to-end encryption
- [ ] Message search
- [ ] User blocking

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

---

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Email login
- `POST /api/auth/session` - Google OAuth callback
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Users
- `GET /api/users/search?q=` - Search users
- `GET /api/users/{id}` - Get user profile
- `PUT /api/users/language` - Update language preference
- `POST /api/users/heartbeat` - Online status heartbeat

### Conversations
- `POST /api/conversations` - Create conversation/group
- `GET /api/conversations` - List conversations
- `GET /api/conversations/{id}` - Get conversation details
- `POST /api/conversations/{id}/members` - Add group member

### Messages
- `POST /api/conversations/{id}/messages` - Send message
- `GET /api/conversations/{id}/messages` - Get messages
- `POST /api/conversations/{id}/typing` - Set typing status
- `GET /api/conversations/{id}/typing` - Get typing users

### Reactions & Media
- `POST /api/messages/{id}/reactions` - Add reaction
- `DELETE /api/messages/{id}/reactions/{emoji}` - Remove reaction
- `POST /api/upload` - Upload file
- `POST /api/voice/upload` - Upload voice message
- `GET /api/files/{id}` - Get uploaded file

### Utilities
- `GET /api/languages` - Supported languages
- `GET /api/stickers` - Sticker packs
- `GET /api/animated-emojis` - Animated emoji sets
- `POST /api/translate` - Translate text
- `POST /api/emoji/convert` - Convert text to emoji

---

## Prioritized Backlog

### P0 - Critical (Next Sprint)
- [ ] Phone number registration with SMS verification (Twilio)

### P1 - High Priority
- [ ] Message search functionality
- [ ] User blocking/muting
- [ ] Push notifications
- [ ] Message forwarding

### P2 - Medium Priority
- [ ] Voice message transcription (Whisper)
- [ ] Video calls (WebRTC)
- [ ] Story/Status feature
- [ ] Custom sticker upload

### P3 - Low Priority
- [ ] Message scheduling
- [ ] Polls in groups
- [ ] Location sharing
- [ ] Contact sharing

---

## Next Tasks

1. **Phone Registration**: Integrate Twilio for SMS verification
2. **Search**: Add message and conversation search
3. **Notifications**: Browser push notifications for new messages
4. **Performance**: Add message pagination and lazy loading
5. **Security**: Implement rate limiting and input sanitization
