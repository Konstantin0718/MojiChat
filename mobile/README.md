# ChatApp - React Native Mobile App

## Placeholder Name
The app is currently named **"ChatApp"** - this can be changed later in `app.json`.

## Project Structure

```
mobile/
├── App.tsx                 # Main entry point
├── app.json               # Expo configuration
├── src/
│   ├── config/            # App configuration
│   │   └── index.ts       # API URL, colors, languages
│   ├── contexts/          # React contexts
│   │   ├── AuthContext.tsx
│   │   └── ThemeContext.tsx
│   ├── screens/           # App screens
│   │   ├── LoginScreen.tsx
│   │   ├── RegisterScreen.tsx
│   │   ├── ConversationsScreen.tsx
│   │   ├── ChatScreen.tsx
│   │   └── SettingsScreen.tsx
│   ├── services/          # API & services
│   │   ├── api.ts         # API client
│   │   └── notifications.ts  # Push notifications
│   ├── types/             # TypeScript types
│   │   └── index.ts
│   └── components/        # Reusable components
└── assets/                # Images, fonts, etc.
```

## Features Implemented

✅ User Authentication (Login/Register)
✅ Conversations List
✅ Chat Screen with Emoji Reveal
✅ Auto-translation
✅ Voice/Audio messages support
✅ Image messages support
✅ Reactions on messages
✅ Typing indicators
✅ Online status
✅ Push notifications infrastructure
✅ Dark/Light theme
✅ Language preferences

## Running the App

### Development
```bash
cd mobile
npx expo start
```

Then:
- Press `a` for Android emulator
- Press `i` for iOS simulator
- Scan QR code with Expo Go app on your phone

### Building for Production

#### Android APK (for testing)
```bash
npx eas build --platform android --profile preview
```

#### Android App Bundle (for Play Store)
```bash
npx eas build --platform android --profile production
```

#### iOS (for App Store)
```bash
npx eas build --platform ios --profile production
```

## Configuration

### 1. Update App Name
Edit `app.json`:
```json
{
  "expo": {
    "name": "Your App Name",
    "slug": "your-app-name",
    "android": {
      "package": "com.yourcompany.appname"
    },
    "ios": {
      "bundleIdentifier": "com.yourcompany.appname"
    }
  }
}
```

### 2. Firebase Setup (for Push Notifications)

1. Create Firebase project at https://console.firebase.google.com
2. Add Android app with package name: `com.chatapp.mobile`
3. Download `google-services.json` → place in `/mobile/`
4. Add iOS app with bundle ID: `com.chatapp.mobile`
5. Download `GoogleService-Info.plist` → place in `/mobile/`

### 3. Update API URL
Edit `src/config/index.ts`:
```typescript
export const API_URL = 'https://your-production-api.com';
```

## Play Store Submission

### Required Assets
- App icon: 512x512 PNG
- Feature graphic: 1024x500 PNG
- Screenshots: At least 2 per device type
- Privacy policy URL
- App description

### Build Commands
```bash
# First, configure EAS
npx eas build:configure

# Build for Play Store
npx eas build --platform android --profile production

# Submit to Play Store
npx eas submit --platform android
```

## App Store Submission (iOS)

### Required Assets
- App icon: 1024x1024 PNG
- Screenshots: 6.5" and 5.5" displays
- Privacy policy URL
- App description

### Build Commands
```bash
# Build for App Store
npx eas build --platform ios --profile production

# Submit to App Store
npx eas submit --platform ios
```
