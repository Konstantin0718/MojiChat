# MojiChat - PRD

## Original Problem Statement
Chat application "MojiChat" similar to WhatsApp/Messenger with AI-powered text-to-emoji conversion, real-time chat, translation, and media support.

## Architecture
- **Backend**: FastAPI + MongoDB Atlas → **Render** (https://mojichat.onrender.com)
- **Frontend (Web)**: React + TailwindCSS + Shadcn UI → **Vercel** (pending deploy)
- **Mobile**: React Native / Expo SDK 55
- **AI**: OpenAI GPT-4o via Emergent LLM Key

## Implemented Features

### Core Chat
- JWT Auth, 1-to-1 & group conversations, message send/receive
- WebSocket real-time events, file uploads, voice messages
- Giphy GIF search, emoji picker, message reactions, forwarding

### Emoji + Translation (NEW - March 18, 2026)
- **Emoji display**: `[...string]` Unicode handling (no ◆ diamonds)
- **Click-to-reveal**: shows translated text + original below
- **Auto-detect language**: 🌐 option in language selector
- **Manual language selection**: 17 languages (bg, en, de, es, fr, it, ru, tr, zh, ja, ko, ar, pt, nl, pl, uk)
- **Smart polling**: reveal/translation state preserved during message updates
- **Mobile MessageBubble**: tap-to-reveal with emoji + translation

### Infrastructure
- Render backend deployment (LIVE)
- MongoDB Atlas data migration
- Vercel config (package.json 54 deps, craco, tailwindcss v3)
- CORS fix (withCredentials removed for JWT)

## Bugs Fixed
1. ✅ Chat message ordering (inverted FlatList)
2. ✅ Theme toggle flickering (useMemo)
3. ✅ Diamond ◆ emoji symbols (split→spread)
4. ✅ CORS error (withCredentials)
5. ✅ Login crash on mobile (push notification try-catch)
6. ✅ Render deploy (MONGO_URL vs MONGODB_URI)
7. ✅ Smart polling (state preservation)
8. ✅ EmojiRevealCard click handler (data-testid placement)

## Pending Tasks
1. **P1**: Vercel deploy (Save to Github + Redeploy)
2. **P1**: Mobile OTA update from Mac
3. **P2**: Firebase "Forgot Password" flow
4. **P2**: Video/Audio calls (WebRTC)
5. **P2**: Push Notifications (FCM key)
6. **P2**: UI Redesign
7. **P3**: Complete i18n
8. **P3**: Stories, Blocking, Stickers finalization

## Credentials
- User: konstantin_sabev@abv.bg / Banane.com
- Render: https://mojichat.onrender.com
- Atlas: mongodb+srv://konstantinsabev_db_user:Zaminawamcom@mojichat-cluster.hdvnz1h.mongodb.net/mojichat_db
