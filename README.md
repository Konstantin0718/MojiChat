# MojiChat

Emoji chat with a FastAPI backend, a React web app, and an Expo mobile app.

## Environment variables

Set these on the service that needs them. Do not commit secret values.

### Backend (Render)

| Variable | Required | Purpose |
|---|---|---|
| `MONGO_URL` | yes | MongoDB connection string |
| `DB_NAME` | no | Database name, default `mojichat_db` |
| `JWT_SECRET` | yes | Signs login tokens. The API refuses to start if this is missing, `default_secret`, or shorter than 32 characters |
| `CORS_ORIGINS` | no | Comma-separated web origins. Defaults to `https://moji-chat-gamma.vercel.app`. A `*` entry is ignored |
| `FRONTEND_URL` | for reset email | Public web origin used to build `/forgot-password?token=` links |
| `BREVO_API_KEY` | for reset email on Render | Brevo HTTPS API key. When set, reset mail uses Brevo only |
| `EMAIL_FROM` | with Brevo | Sender address. Falls back to `SMTP_FROM` |
| `EMAIL_FROM_NAME` | no | Sender name, default `MojiChat` |
| `SMTP_HOST` | local SMTP only | Used only when `BREVO_API_KEY` is unset |
| `SMTP_PORT` | no | Default `587`. `465` uses SSL |
| `SMTP_USERNAME` | no | SMTP login |
| `SMTP_PASSWORD` | no | SMTP password |
| `SMTP_FROM` | local SMTP | Sender if `EMAIL_FROM` is empty |
| `SMTP_USE_TLS` | no | Default true for ports other than 465 |
| `GIPHY_API_KEY` | no | GIF search. Routes still require a logged-in user |
| `EMERGENT_LLM_KEY` | no | Real translation and emoji conversion. Without it, translation reports unavailable and emoji conversion uses the local fallback |
| `LLM_MAX_INPUT_CHARS` | no | Max text for `/translate` and `/emoji/convert`. Default `2000`; longer text returns 413. A chat message still sends and uses the local emoji fallback |
| `LLM_RATE_PER_MINUTE` | no | Per-user LLM calls per minute. Default `30` |
| `LLM_RATE_PER_DAY` | no | Per-user LLM calls per day. Default `300` |
| `LLM_IP_RATE_PER_MINUTE` | no | Per-IP LLM calls per minute, using the trusted client IP. Default `60` |
| `EXPOSE_RESET_TOKEN` | no | Leave unset. Dev-only token echo |
| `PHONE_AUTH_ENABLED` | no | Set to `true` to turn on `/auth/phone/*`. Off by default, and those routes then return 404. The SMS code is never returned or logged |
| `CORS_ALLOW_DEV_ORIGINS` | no | Set to `true` to also allow `http://localhost:3000` and `http://127.0.0.1:3000` |

Render free web services block outbound SMTP. Use `BREVO_API_KEY` there.

### Web (Vercel)

| Variable | Purpose |
|---|---|
| `REACT_APP_BACKEND_URL` | Backend origin, without `/api` |
| `REACT_APP_PHONE_AUTH_ENABLED` | Show a phone-login button when `true`. Default off. The web app has no phone button today |
| `REACT_APP_TURN_URL` | Optional TURN server |
| `REACT_APP_TURN_USERNAME` | TURN username |
| `REACT_APP_TURN_CREDENTIAL` | TURN credential |

### Mobile

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_TURN_URL` | Optional TURN server |
| `EXPO_PUBLIC_PHONE_AUTH_ENABLED` | Show "Continue with Phone" on the login screen when `true`. Default off |
| `EXPO_PUBLIC_TURN_USERNAME` | TURN username |
| `EXPO_PUBLIC_TURN_CREDENTIAL` | TURN credential |
