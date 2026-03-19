# MojiChat - PRD

## Original Problem Statement
Chat application "MojiChat" - WhatsApp-like with AI emoji conversion, real-time chat, translation, media.

## Architecture
- **Backend**: FastAPI + MongoDB Atlas + Firebase Admin SDK (env var)
- **Frontend (Web)**: React + TailwindCSS + Shadcn UI
- **Mobile**: React Native / Expo SDK 55
- **AI**: OpenAI GPT-4o via Emergent LLM Key

## Implemented Features

### Core Chat
- JWT Auth, conversations, messages, WebSocket, file uploads, voice, Giphy, reactions

### Emoji + Translation
- Click-to-reveal, auto-detect language, 17 languages + auto, inline language badges
- Separate translation language (chat header, localStorage) and UI language (settings, server)
- Mobile: own messages don't translate, received messages translate on tap

### Chat Toolbar (Web + Mobile) - March 19, 2026
- **Voice messages**: Functional recording + sending (MediaRecorder on web, expo-av on mobile)
- **Giphy GIFs**: Real Giphy API integration with search and trending
- **Emoji picker**: Full emoji categories + stickers + GIF tabs
- **File attachment**: Drag & drop on web, DocumentPicker on mobile
- **Camera**: getUserMedia capture on web, ImagePicker.launchCameraAsync on mobile
- **Gallery**: Image picker for photos/videos

### Firebase (from env var - safe for GitHub)
- Service account JSON stored in FIREBASE_SERVICE_ACCOUNT_JSON env var
- firebase-service-account.json file DELETED from code
- FCM push via Firebase Admin SDK
- FCM + Expo token registration endpoints

### Infrastructure
- Render backend, MongoDB Atlas, Vercel web frontend

## Bugs Fixed
1-5. Previous fixes (emoji, translation, CORS, etc.)
6. Firebase key in code blocking GitHub push - moved to env var
7. Mobile own messages translating - removed
8. Mobile received messages not translating - fixed
9. Fake GIFs in emoji picker - replaced with real Giphy

## Pending Tasks
1. **P1**: Save to Github + Vercel Redeploy + Render redeploy
2. **P1**: Firebase "Forgot Password" flow
3. **P2**: Video/Audio Calls (WebRTC)
4. **P2**: UI Redesign
5. **P3**: Full i18n, Stories, Blocking, Stickers, Custom Sounds

## Credentials
- User: konstantin_sabev@abv.bg / Banane.com
- Render: https://mojichat.onrender.com
- Firebase project: mijichat-7d13c
- Giphy API Key: wvmYJRpySN3wAkqi4Basf5boEMSlZPtc
