# MijiChat - PRD (Product Requirements Document)

## Версия: 2.1.0 - WebSocket & Giphy Integration

---

## Нови функции в тази версия (v2.1.0)

### ✅ WebSocket Real-time Communication
- Backend WebSocket endpoint `/ws/{user_id}`
- Real-time typing indicators без polling
- Instant message delivery
- Online/offline status updates
- Read receipts в реално време
- Автоматичен reconnect при загуба на връзка

### ✅ Giphy Integration
- Търсене на GIF-ове чрез Giphy API
- Trending GIFs секция
- GIF picker в чат интерфейса
- Пълна интеграция в ChatScreen

### ✅ Password Visibility Toggle
- Show/Hide password икона в Login екрана
- Show/Hide password икона в Register екрана

### ✅ EAS Updates (OTA) Configuration
- Конфигуриран expo-updates за OTA
- runtimeVersion: appVersion
- Всички бъдещи JS промени ще се разпространяват без нов APK

---

## Нови функции от v2.0.0

### ✅ UI Локализация (6 езика)
- English, Български, Русский, Deutsch, Español, Français
- Всички менюта и бутони на избрания език
- Автоматично откриване на езика на устройството

### ✅ Video Call екран
- UI за видео разговори с камера
- Mute/unmute микрофон
- Camera on/off
- Flip camera (front/back)
- Speaker toggle
- Pulse анимация при звънене

### ✅ Stickers & GIFs
- Emoji picker с категории
- Sticker packs от сървъра
- GIF търсене (placeholder за Giphy)

### ✅ Status/Stories
- Създаване на текстови статуси с цветен фон
- Снимки от камера/галерия
- 24-часова видимост
- Progress bar при преглед
- My Status / Recent / Viewed секции

### ✅ Блокиране на потребители
- Block/Unblock функция
- Списък с блокирани потребители
- Блокираните не могат да пишат

### ✅ Настройки за известия
- Избор на звук (Default, Chime, Bell, Pop, Ding, None)
- Вибрация on/off
- Звук on/off
- Message preview on/off

### ✅ Message Forwarding
- Препращане на съобщения към други чатове

### ✅ Permissions
- Camera, Microphone, Contacts, Phone, Storage
- Notification permission за Android 13+

---

## Пълен списък на екраните

| Екран | Файл | Описание |
|-------|------|----------|
| Login | LoginScreen.tsx | Email/Password + Phone |
| Register | RegisterScreen.tsx | Регистрация |
| ForgotPassword | ForgotPasswordScreen.tsx | Нова парола |
| PhoneAuth | PhoneAuthScreen.tsx | SMS верификация |
| Conversations | ConversationsScreen.tsx | Списък чатове |
| Chat | ChatScreen.tsx | Чат + voice + files |
| Settings | SettingsScreen.tsx | Настройки |
| NewChat | NewChatScreen.tsx | Нов чат |
| NewGroup | NewGroupScreen.tsx | Нова група |
| VideoCall | VideoCallScreen.tsx | Видео разговор |
| BlockedUsers | BlockedUsersScreen.tsx | Блокирани |
| NotificationSettings | NotificationSettingsScreen.tsx | Звуци |
| Status | StatusScreen.tsx | Статуси/Stories |

---

## Компоненти

| Компонент | Описание |
|-----------|----------|
| MessageBubble | Съобщение с emoji reveal + GIF support |
| AudioPlayer | Възпроизвеждане на аудио |
| VoiceRecorder | Запис на глас |
| GiphyPicker | Търсене и изпращане на GIF-ове |

---

## Services

| Service | Файл | Описание |
|---------|------|----------|
| API | api.ts | REST API клиент |
| WebSocket | websocket.ts | Real-time комуникация |
| Giphy | giphy.ts | Giphy API клиент |
| Notifications | notificationService.ts | Push notifications |

---

## API Endpoints (Backend)

### Auth (9 endpoints)
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /api/auth/me
- POST /api/auth/forgot-password
- POST /api/auth/reset-password
- POST /api/auth/send-verification
- GET /api/auth/verify-email/{token}
- POST /api/auth/phone/send-code
- POST /api/auth/phone/verify

### Users (6 endpoints)
- GET /api/users/search
- GET /api/users/{id}
- GET /api/users/blocked
- POST /api/users/{id}/block
- DELETE /api/users/{id}/block
- PUT /api/users/language

### Status (4 endpoints)
- GET /api/statuses
- POST /api/statuses
- POST /api/statuses/{id}/view
- DELETE /api/statuses/{id}

### Giphy (2 endpoints) - NEW
- GET /api/giphy/search?q={query}&limit={limit}
- GET /api/giphy/trending?limit={limit}

### WebSocket - NEW
- WS /ws/{user_id}?token={jwt_token}
  - Events: typing, new_message, message_read, online_status

### Messages (+ forward)
- POST /api/messages/{id}/forward

### Notifications
- POST /api/notifications/send-push

---

## Build Commands

```bash
# Development
cd /app/mobile && npx expo start

# Build APK
eas build --platform android --profile preview

# Build for Play Store
eas build --platform android --profile production
```

---

## За обновленията на приложението

**Кога трябва нов build (преинсталация)?**
- Нови permissions (camera, contacts, etc.)
- Нови native plugins
- Промяна на google-services.json
- Промяна на app.json (package name, version)

**Кога НЕ трябва нов build?**
- Промени в JavaScript/TypeScript код
- Нови екрани или компоненти
- Bug fixes в логиката
- UI промени

→ Тези промени могат да се публикуват с **OTA Update** (`eas update`) без преинсталация!

---

## Текущ Build

**URL:** https://expo.dev/accounts/konstantin0/projects/mijichat/builds/9ccb3820-a0a1-4af9-923f-88d3b770de6f

**Status:** In Progress

---

## Changelog

### March 9, 2026 - v2.1.0
- WebSocket real-time communication
- Giphy GIF search & send integration
- Password visibility toggle (show/hide)
- EAS Updates OTA configuration
- Improved typing indicators via WebSocket
- GiphyPicker component
- websocket.ts service
- giphy.ts service

### March 9, 2026 - v2.0.0
- UI Локализация (6 езика)
- Video Call екран
- Status/Stories функционалност
- Sticker/GIF picker
- Blocked users management
- Notification sound settings
- Message forwarding API
- Full permissions setup

### March 8, 2026 - v1.1.0
- Password reset
- Email verification
- Phone authentication
- Push notification setup

### December 2025 - v1.0.0
- Initial release
- Chat functionality
- Voice messages
- Emoji conversion
