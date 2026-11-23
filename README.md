# MojiChat

Emoji chat with a FastAPI backend, a React web app, and an Expo mobile app.

## Environment variables

Set these on the service that needs them. Do not commit secret values.

### Backend (Render)

| Variable | Required | Purpose |
|---|---|---|
| `MONGO_URL` | yes | MongoDB connection string |
| `DB_NAME` | no | Database name, default `mojichat_db` |
| `JWT_SECRET` | yes | Signs login tokens |
| `CORS_ORIGINS` | no | Comma-separated web origins, or `*` |
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
| `EMERGENT_LLM_KEY` | no | Real translation. Without it, translation reports unavailable |
| `EXPOSE_RESET_TOKEN` | no | Leave unset. Dev-only token echo |
| `GOOGLE_CLIENT_ID` | for Google sign-in | Web OAuth client ID. Verifies the Google ID token audience |

Render free web services block outbound SMTP. Use `BREVO_API_KEY` there.

### Web (Vercel)

| Variable | Purpose |
|---|---|
| `REACT_APP_BACKEND_URL` | Backend origin, without `/api` |
| `REACT_APP_GOOGLE_CLIENT_ID` | Same Web client ID as `GOOGLE_CLIENT_ID`. Hides the Google button when unset. Create React App reads it at build time |
| `REACT_APP_TURN_URL` | Optional TURN server |
| `REACT_APP_TURN_USERNAME` | TURN username |
| `REACT_APP_TURN_CREDENTIAL` | TURN credential |

### Mobile

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_TURN_URL` | Optional TURN server |
| `EXPO_PUBLIC_TURN_USERNAME` | TURN username |
| `EXPO_PUBLIC_TURN_CREDENTIAL` | TURN credential |
