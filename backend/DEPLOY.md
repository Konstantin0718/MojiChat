# MojiChat Backend - Deployment на Render

## Стъпка 1: MongoDB Atlas (безплатна база данни)

1. Отворете https://www.mongodb.com/cloud/atlas
2. Създайте безплатен акаунт (или влезте)
3. Създайте **Free Cluster** (M0 - безплатен)
4. В **Database Access** → Add Database User:
   - Username: `mojichat`
   - Password: изберете силна парола
5. В **Network Access** → Add IP Address → **Allow Access from Anywhere** (0.0.0.0/0)
6. В **Database** → **Connect** → **Drivers** → копирайте connection string:
   ```
   mongodb+srv://mojichat:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   Заменете `<password>` с паролата от стъпка 4.

---

## Стъпка 2: Deploy на Render

1. Натиснете **"Save to Github"** в Emergent чата за да запазите кода в GitHub
2. Отворете https://render.com и влезте (или създайте акаунт)
3. Натиснете **New** → **Web Service**
4. Свържете GitHub репото и изберете **backend** папката
5. Настройки:
   - **Name:** `mojichat-backend`
   - **Root Directory:** `backend`
   - **Runtime:** `Docker`
   - **Instance Type:** Free
6. В **Environment Variables** добавете:

   | Key | Value |
   |-----|-------|
   | `MONGO_URL` | `mongodb+srv://mojichat:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority` |
   | `DB_NAME` | `mojichat_db` |
   | `JWT_SECRET` | `<your-jwt-secret>` |
   | `GIPHY_API_KEY` | `<your-giphy-api-key>` |
   | `EMERGENT_LLM_KEY` | `<your-emergent-llm-key>` |
   | `CORS_ORIGINS` | `*` |
   | `FRONTEND_URL` | публичният адрес на уеба, без `/api` |
   | `BREVO_API_KEY` | ключ от Brevo (HTTPS). На безплатния Render SMTP портовете са блокирани |
   | `EMAIL_FROM` | адрес на подателя. Ако липсва, ползва се `SMTP_FROM` |
   | `EMAIL_FROM_NAME` | име на подателя, по подразбиране `MojiChat` |

   `EXPOSE_RESET_TOKEN` не се задава. `SMTP_HOST` е само за локална машина, не за Render free.

7. Натиснете **Create Web Service**
8. Изчакайте deploy-а (~3-5 минути)
9. Ще получите постоянен URL: `https://mojichat-backend.onrender.com` (или подобен)

---

## Стъпка 3: Обновяване на мобилното приложение

След като получите Render URL-а, на вашия компютър (Mac):

```bash
# 1. Отворете проекта
cd /path/to/mobile

# 2. Обновете API URL-а
# В файла src/config/index.ts заменете:
# export const API_URL = 'https://chat-emoji-dev.preview.emergentagent.com';
# с:
# export const API_URL = 'https://mojichat-backend.onrender.com';

# 3. Пуснете OTA Update
eas update --channel preview --message "Switch to permanent Render backend"
```

---

## Стъпка 4: Тест

1. Отворете приложението на телефона
2. Затворете го и отворете пак (за да зареди OTA update)
3. Опитайте да влезете с `<test-user-email>`

---

## Важно!
- **Render Free** tier спира сървъра след 15 мин неактивност. Първото зареждане може да отнеме 30-60 секунди.
- За по-бърз сървър, изберете **Starter** план ($7/месец).
- MongoDB Atlas M0 е безплатен до 512MB.
