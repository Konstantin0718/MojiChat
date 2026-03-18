# MojiChat - PRD

## Original Problem Statement
Chat application "MojiChat" similar to WhatsApp/Messenger with AI-powered text-to-emoji conversion, real-time chat, translation, and media support.

## Architecture
- **Backend**: FastAPI + MongoDB Atlas (Render: https://mojichat.onrender.com)
- **Frontend (Web)**: React + TailwindCSS + Shadcn UI (Vercel)
- **Mobile**: React Native / Expo SDK 55
- **AI**: OpenAI GPT-4o via Emergent LLM Key

## Implemented Features

### Core Chat
- JWT Auth, conversations, messages, WebSocket, file uploads, voice, Giphy, reactions

### Emoji + Translation
- **Emoji display**: Unicode emojis (no diamond symbols)
- **Click-to-reveal**: ALL messages translate on click
- **Auto-detect language**: 17 manual languages + auto-detect
- **Inline language badges**: flag emoji per message
- **Smart polling**: state preserved during updates

### Language Selectors (March 18, 2026)
- **Translation language** (chat header): Stored in localStorage(`mojichat_translation_lang`), dialog titled "Превод на съобщения"
- **UI language** (Settings): Stored on server via `PUT /api/users/language`, section titled "Език на интерфейса"
- Both selectors are **independent** - changing one doesn't affect the other
- Translation prompt improved to always translate (removed "return as-is" rule)

### Infrastructure
- Render backend (LIVE), MongoDB Atlas, Vercel config ready

## Bugs Fixed
1. Chat ordering, Theme flicker, Diamond emojis, CORS, Login crash
2. Render deploy, Data migration, Vercel build config
3. Smart polling, EmojiRevealCard click, Translation defaults
4. Translation returning untranslated text (GPT prompt fix)
5. Translation/UI language selectors were merged - now separated

## Pending Tasks
1. **P1**: Save to Github + Vercel Redeploy + Mobile OTA
2. **P1**: Firebase "Forgot Password" flow
3. **P1**: Push Notifications (FCM server key needed from user)
4. **P2**: Video/Audio Calls (WebRTC)
5. **P2**: UI Redesign
6. **P3**: Full i18n integration, Stories, Blocking, Stickers, Custom Sounds

## Credentials
- User: konstantin_sabev@abv.bg / Banane.com (preferred_language: bg)
- Render: https://mojichat.onrender.com
- Atlas: mongodb+srv://konstantinsabev_db_user:Zaminawamcom@mojichat-cluster.hdvnz1h.mongodb.net/mojichat_db
