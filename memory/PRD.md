# MojiChat - PRD

## Original Problem Statement
Chat application "MojiChat" similar to WhatsApp/Messenger with AI-powered text-to-emoji conversion, real-time chat, translation, and media support.

## Architecture
- **Backend**: FastAPI + MongoDB Atlas → **Render** (https://mojichat.onrender.com)
- **Frontend (Web)**: React + TailwindCSS + Shadcn UI → **Vercel**
- **Mobile**: React Native / Expo SDK 55
- **AI**: OpenAI GPT-4o via Emergent LLM Key

## Implemented Features

### Core Chat
- JWT Auth, conversations, messages, WebSocket, file uploads, voice, Giphy, reactions

### Emoji + Translation (March 18, 2026)
- **Emoji display**: [...string] Unicode (no ◆ diamonds)
- **Click-to-reveal**: ALL messages (emoji + plain text) translate on click
- **Auto-detect language**: 🌐 + 17 manual languages
- **Inline language badges**: flag emoji per message (🇧🇬, 🇬🇧, 🇩🇪...)
- **Default language**: Bulgarian (bg)
- **Smart polling**: state preserved during updates

### Infrastructure
- Render backend (LIVE), MongoDB Atlas, Vercel config ready

## Bugs Fixed
1. ✅ Chat ordering, Theme flicker, Diamond emojis, CORS, Login crash
2. ✅ Render deploy, Data migration, Vercel build config
3. ✅ Smart polling, EmojiRevealCard click, Translation defaults

## Pending Tasks
1. **P1**: Save to Github + Vercel Redeploy + Mobile OTA
2. **P2**: Firebase Forgot Password, Video Calls, Push Notifications
3. **P3**: UI Redesign, i18n, Stories, Blocking, Stickers

## Credentials
- User: konstantin_sabev@abv.bg / Banane.com (preferred_language: bg)
- Render: https://mojichat.onrender.com
- Atlas: mongodb+srv://konstantinsabev_db_user:Zaminawamcom@mojichat-cluster.hdvnz1h.mongodb.net/mojichat_db
