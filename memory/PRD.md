# MojiChat - PRD

## Original Problem Statement
Chat application "MojiChat" similar to WhatsApp/Messenger with AI-powered text-to-emoji conversion, real-time chat, translation, and media support. React web + React Native mobile + FastAPI backend.

## Architecture
- **Backend**: FastAPI + MongoDB Atlas (deployed on **Render**: https://mojichat.onrender.com)
- **Frontend (Web)**: React + TailwindCSS + Shadcn UI (deploy target: **Vercel**)
- **Mobile**: React Native / Expo SDK 55
- **AI**: OpenAI GPT-4o via Emergent LLM Key
- **Auth**: JWT

## What's Implemented

### Backend (Render - LIVE)
- JWT Auth (register, login, me, forgot-password, reset-password, email verification, phone auth)
- Conversations CRUD + participants
- Messages: send, get, forward, reactions
- WebSocket real-time events
- File uploads (images, audio, video, files)
- AI emoji conversion (GPT-4o)
- AI translation (GPT-4o) - on-demand via POST /api/translate
- Giphy GIF search
- Status/Stories CRUD
- Push notifications (FCM - BROKEN)
- User blocking, online status, typing indicators

### Web Frontend
- Landing page, Login, Register
- Chat layout with sidebar + messages
- EmojiRevealCard: emoji display with [...string] Unicode handling
- Click-to-reveal: shows translated text + original below
- Smart polling (preserves reveal/translation state)
- Dark/Light theme toggle (no flicker - useMemo fix)
- Language selector (8 languages)
- Message search, reactions, file upload, voice recorder, GIF picker
- Responsive sidebar

### Mobile App
- All screens: Login, Register, Chat, Settings, etc.
- MessageBubble: emoji display + tap-to-reveal with translation
- Smart polling (preserves state)
- Theme context with useMemo (no flicker)
- EAS Build + OTA configured

## Bugs Fixed (March 2026)
1. ✅ Chat message ordering (inverted FlatList)
2. ✅ Theme toggle flickering (useMemo context value)
3. ✅ Diamond ◆ emoji symbols (split('') → [...string])
4. ✅ CORS error (removed withCredentials for JWT auth)
5. ✅ Login crash on mobile (push notification try-catch)
6. ✅ Render deploy (MONGO_URL vs MONGODB_URI)
7. ✅ Data migration to MongoDB Atlas
8. ✅ Vercel build (package.json 54 deps, craco, tailwindcss v3)
9. ✅ Smart polling (doesn't reset reveal/translation state)

## Pending Tasks
1. **P1**: Vercel deploy fix (vercel.json cleaned, package.json updated - needs Save to Github + Redeploy)
2. **P2**: Mobile OTA update (needs to be run from user's Mac - Expo SDK 55 requires matching Expo Go)
3. **P2**: Firebase "Forgot Password" flow
4. **P2**: Video/Audio calls (WebRTC)
5. **P2**: Push Notifications (FCM key issue)
6. **P2**: UI Redesign
7. **P3**: Complete i18n
8. **P3**: Stories, Blocking, Stickers, Custom Sounds finalization

## Test Credentials
- Email: konstantin_sabev@abv.bg / Password: Banane.com
- Giphy API Key: wvmYJRpySN3wAkqi4Basf5boEMSlZPtc
- Render URL: https://mojichat.onrender.com
- MongoDB Atlas: mongodb+srv://konstantinsabev_db_user:Zaminawamcom@mojichat-cluster.hdvnz1h.mongodb.net/mojichat_db

## Key Files
- `/app/backend/server.py` - Main backend
- `/app/frontend/src/components/chat/EmojiRevealCard.jsx` - Emoji display + translation
- `/app/frontend/src/components/chat/ChatLayout.jsx` - Web chat (smart polling)
- `/app/frontend/src/contexts/ThemeContext.jsx` - Web theme (useMemo)
- `/app/mobile/src/components/MessageBubble.tsx` - Mobile emoji + translation
- `/app/mobile/src/screens/ChatScreen.tsx` - Mobile chat (smart polling)
- `/app/mobile/src/contexts/ThemeContext.tsx` - Mobile theme (useMemo)
