# MojiChat - PRD (Product Requirements Document)

## Version: 2.2.0 - Bug Fixes (Message Ordering & Theme Flicker)

---

## Original Problem Statement
Create a chat application named "MojiChat", similar to WhatsApp/Messenger, with:
- Text-to-emoji conversion (AI-powered)
- Real-time 1-to-1 and group chats via WebSockets
- Online status, typing indicators, read receipts
- Media support (images, voice, files, GIFs)
- Video calls, message search, push notifications
- Story/Status feature, user blocking
- Multi-language support, customizable sounds, Dark/Light/System theme
- React Native mobile app + React web app

## Architecture
- **Backend**: FastAPI + MongoDB + WebSockets (port 8001)
- **Frontend (Web)**: React (port 3000)
- **Mobile**: React Native / Expo
- **AI**: OpenAI GPT-4o for emoji conversion (Emergent LLM Key)
- **Auth**: JWT + Google Social Login
- **Media**: Giphy API, file uploads
- **Builds**: EAS Build + OTA Updates

## What's Been Implemented

### Core
- JWT Authentication (register, login, logout, me)
- 1-to-1 and group conversations
- Message sending/receiving with polling (3s interval)
- WebSocket for real-time events (typing, online, messages)
- File upload (images, audio, video, files)
- Voice messages with recording + playback
- Giphy GIF search & send
- Emoji picker
- Message reactions
- Message forwarding
- User search
- User blocking
- Online/offline status
- Read receipts

### UI/UX
- Landing page
- Login/Register pages
- Chat layout with sidebar + message area
- Dark/Light theme toggle (fixed - no flickering)
- Language selector (6 languages)
- Message search (Cmd+K)
- Video call UI placeholder
- Notification settings
- PWA install prompt
- Mobile-responsive sidebar (Sheet)

### Mobile App
- All screens: Login, Register, ForgotPassword, PhoneAuth, Conversations, Chat, Settings, NewChat, NewGroup, VideoCall, BlockedUsers, NotificationSettings, Status
- EAS Build configured
- OTA Updates configured

### Backend Endpoints
- Auth: 10 endpoints (register, login, logout, me, forgot-password, reset-password, send-verification, verify-email, phone/send-code, phone/verify)
- Users: 6 endpoints (search, get, blocked, block, unblock, language)
- Conversations: CRUD + messages + typing
- Messages: send, get, forward, reactions
- Status/Stories: CRUD + view
- Giphy: search, trending
- WebSocket: /ws/{user_id}
- Notifications: send-push
- Files: upload
- Calls: initiate, active, end (UI only)

## Bugs Fixed (March 15, 2026)

### Bug 1: Chat Message Ordering (P0) - FIXED
- **Problem**: Messages displayed in wrong order (newest at top)
- **Root Cause**: Inverted FlatList data sorting was incorrect
- **Fix (Mobile)**: `ChatScreen.tsx` - Sort newest-first for inverted FlatList + `useCallback` for `renderMessage` and `keyExtractor` + `transform: [{scaleY: -1}]` on ListEmptyComponent + `maintainVisibleContentPosition`
- **Fix (Web)**: Already correct (oldest-first rendering with scrollIntoView)
- **Backend**: Returns oldest→newest via `reversed(DESC query)` - confirmed correct

### Bug 2: Theme Toggle Flickering (P1) - FIXED
- **Problem**: Theme toggle button caused re-render loops/flickering
- **Root Cause**: Context value object recreated every render, causing all consumers to re-render
- **Fix (Web)**: `ThemeContext.jsx` - Added `useMemo` for context value
- **Fix (Mobile)**: `ThemeContext.tsx` - Added `useMemo` for context value + `useCallback` for `setTheme`/`toggleTheme` + `useRef` for theme comparison

## Known Issues / Broken Features
- Video/Audio calls: UI placeholder only, no WebRTC implementation
- Forgot Password flow: Uses in-app token instead of Firebase `sendPasswordResetEmail`
- Push Notifications: FCM server key error - BLOCKED
- UI Language Translation: Changing language doesn't translate full app interface
- Emoji reveal characters: Some emoji_content shows replacement characters (diamond ?)

## Pending Tasks (Priority Order)
1. **P2**: Deploy backend to persistent hosting (Render) - Dockerfile exists
2. **P2**: Implement Firebase "Forgot Password" flow
3. **P2**: Implement Video/Audio Calls (WebRTC)
4. **P2**: Fix Push Notifications (FCM key issue)
5. **P2**: UI Redesign
6. **P3**: Complete i18n Integration
7. **P3**: Finalize Stories, User Blocking, Stickers, Custom Sounds, Message Forwarding

## Test Credentials
- User 1: test1@mojichat.com / Test1234!
- User 2: test2@mojichat.com / Test1234!
- Giphy API Key: wvmYJRpySN3wAkqi4Basf5boEMSlZPtc

## Key Files
- `/app/backend/server.py` - Main backend
- `/app/frontend/src/components/chat/ChatLayout.jsx` - Web chat UI
- `/app/frontend/src/contexts/ThemeContext.jsx` - Web theme (fixed)
- `/app/mobile/src/screens/ChatScreen.tsx` - Mobile chat (fixed)
- `/app/mobile/src/contexts/ThemeContext.tsx` - Mobile theme (fixed)
