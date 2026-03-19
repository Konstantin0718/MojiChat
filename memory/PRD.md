# MojiChat - PRD

## Original Problem Statement
Chat application "MojiChat" similar to WhatsApp/Messenger with AI-powered text-to-emoji conversion, real-time chat, translation, and media support.

## Architecture
- **Backend**: FastAPI + MongoDB Atlas + Firebase Admin SDK (Render: https://mojichat.onrender.com)
- **Frontend (Web)**: React + TailwindCSS + Shadcn UI (Vercel)
- **Mobile**: React Native / Expo SDK 55
- **AI**: OpenAI GPT-4o via Emergent LLM Key

## Implemented Features

### Core Chat
- JWT Auth, conversations, messages, WebSocket, file uploads, voice, Giphy, reactions

### Emoji + Translation
- **Emoji display**: Unicode emojis (no diamond symbols)
- **Click-to-reveal**: Messages translate on click
- **Auto-detect language**: 17 manual languages + auto-detect
- **Inline language badges**: flag emoji per message

### Language Selectors (March 18, 2026)
- **Translation language** (chat header): Stored in localStorage(`mojichat_translation_lang`), dialog "Превод на съобщения"
- **UI language** (Settings): Stored on server via `PUT /api/users/language`, section "Език на интерфейса"
- Both selectors independent on web AND mobile

### Mobile Translation Fix (March 19, 2026)
- **Own messages**: Tap reveals original text only, NO translation API call
- **Received messages**: Tap triggers translation (same as web)
- **Language selector**: Button in chat header opens modal with all 17 languages
- **Translation language**: Persisted in AsyncStorage(`mojichat_translation_lang`)

### Push Notifications - Firebase Admin SDK (March 19, 2026)
- Firebase service account key configured (`firebase-service-account.json`)
- Firebase Admin SDK initialized on backend startup
- FCM token registration: `POST /api/notifications/subscribe-fcm`
- Push sending: FCM first (native tokens), Expo Push API fallback
- Mobile notification service registers both Expo + FCM tokens

### Infrastructure
- Render backend (LIVE), MongoDB Atlas, Vercel config ready

## Bugs Fixed
1. Chat ordering, Theme flicker, Diamond emojis, CORS, Login crash
2. Render deploy, Data migration, Vercel build config
3. Smart polling, EmojiRevealCard click, Translation defaults
4. Translation returning untranslated text (GPT prompt fix)
5. Translation/UI language selectors merged - now separated
6. Mobile own messages translating (removed - now just shows original)
7. Mobile received messages not translating (fixed - same as web)

## Pending Tasks
1. **P1**: Save to Github + Vercel Redeploy + Mobile OTA
2. **P1**: Firebase "Forgot Password" flow (use sendPasswordResetEmail)
3. **P2**: Video/Audio Calls (WebRTC)
4. **P2**: UI Redesign
5. **P3**: Full i18n integration, Stories, Blocking, Stickers, Custom Sounds

## Credentials
- User: konstantin_sabev@abv.bg / Banane.com (preferred_language: bg)
- Render: https://mojichat.onrender.com
- Atlas: mongodb+srv://konstantinsabev_db_user:Zaminawamcom@mojichat-cluster.hdvnz1h.mongodb.net/mojichat_db
- Firebase project: mijichat-7d13c
