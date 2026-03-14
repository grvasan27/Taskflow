# Production Deployment Guide

## Architecture

| Layer | Service | URL |
|---|---|---|
| Frontend | Vercel | `https://taskflowapp.site` |
| Backend | Render | `https://taskflow-7e2j.onrender.com` |
| Database | MongoDB Atlas | Cloud-hosted (M0 Free Tier) |

---

## Step 1: MongoDB Atlas Setup

1. Sign up at [mongodb.com/atlas](https://www.mongodb.com/atlas/database).
2. Create a **free M0 cluster** in your preferred region.
3. Go to **Database Access** → Add a new user with read/write privileges.
4. Go to **Network Access** → Add IP `0.0.0.0/0` (allow all — required for Render).
5. Click **Connect** → **Drivers** → Copy the connection string.
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/
   ```
6. Replace `<password>` in the string with your database user's password.

---

## Step 2: Google Cloud Console Configuration

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Select your project → **APIs & Services** → **Credentials**.
3. Edit your **OAuth 2.0 Client ID**.
4. Under **Authorized JavaScript origins**, add:
   ```
   https://taskflowapp.site
   ```
5. Under **Authorized redirect URIs**, add:
   ```
   https://taskflow-7e2j.onrender.com/api/auth/google/callback
   ```
6. Make sure the following APIs are enabled:
   - Google Calendar API
   - Google Drive API

---

## Step 3: Render Backend Deployment

1. Go to [render.com](https://render.com) and sign in.
2. Create a **New Web Service** → Connect your GitHub repo.
3. Configure the service:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn -k uvicorn.workers.UvicornWorker -w 2 server:app --bind 0.0.0.0:$PORT`
   - **Python Version**: 3.10
4. Add the following **Environment Variables** in the Render dashboard:

   | Key | Value |
   |---|---|
   | `MONGO_URL` | `mongodb+srv://...` (from Atlas) |
   | `DB_NAME` | `taskflow` |
   | `GOOGLE_CLIENT_ID` | From Google Cloud Console |
   | `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
   | `GOOGLE_REDIRECT_URI` | `https://taskflow-7e2j.onrender.com/api/auth/google/callback` |
   | `FRONTEND_URL` | `https://taskflowapp.site` |
   | `ADMIN_EMAILS` | `vasangr27@gmail.com` |
   | `SMTP_EMAIL` | Your Gmail address |
   | `SMTP_PASSWORD` | Your Gmail App Password |

5. Click **Deploy**. Wait for the build to complete (~3-5 min).
6. Verify: visit `https://taskflow-7e2j.onrender.com/api/health` — should return `{"status":"healthy"}`.

> **Note on Free Tier**: The Render free tier "spins down" after 15 mins of inactivity. The first request after sleep takes ~30 seconds. Upgrade to the Starter plan ($7/mo) for always-on service.

---

## Step 4: Vercel Frontend Deployment

1. Go to [vercel.com](https://vercel.com) and import your GitHub repo.
2. Configure the project:
   - **Root Directory**: `frontend`
   - **Build Command**: `craco build` (or `npm run build`)
   - **Output Directory**: `build`
3. Add this **Environment Variable**:
   | Key | Value |
   |---|---|
   | `REACT_APP_BACKEND_URL` | `https://taskflow-7e2j.onrender.com` |

4. Click **Deploy**.

---

## Step 5: Custom Domain (`taskflowapp.site`)

1. In the Vercel dashboard, go to your project → **Settings** → **Domains**.
2. Add `taskflowapp.site` and `www.taskflowapp.site`.
3. Follow the DNS configuration steps Vercel provides (usually just adding CNAME/A records at your domain registrar).
4. Wait for DNS propagation (usually 5-15 minutes).

---

## Troubleshooting

### "Access Pending" after login
Your account needs admin approval. Check that `ADMIN_EMAILS` is set to your email in the Render environment variables.

### Google OAuth `redirect_uri_mismatch`  
The callback URI in Google Cloud Console must exactly match `GOOGLE_REDIRECT_URI` in Render — including `https://` and no trailing slash.

### CORS errors in browser console
Your domain must be in the `allow_origins` list in `server.py`. Check the list and redeploy.

### Render app not responding (500 error)
Check the Render logs tab. Common causes: missing environment variable, Atlas connection string incorrect, or IP not whitelisted in Atlas Network Access.

### Cookie not being set (login loop)
This happens if the cookie flags are wrong. Production requires `Secure=True; SameSite=None` since the frontend (Vercel) and backend (Render) are on different domains.

---

## Cron Jobs & Background Tasks

The FastAPI app uses **APScheduler** for:
- **Auto-backup**: Runs every minute to check if any user's scheduled backup time matches (per user preference).
- **Daily email summaries**: Runs every minute to check if any user's email reminder time matches.

On Render's free tier, APScheduler works **but only while the service is running**. If the service is asleep (after 15 min idle), scheduled jobs won't fire. Upgrade to the Starter plan for reliable cron execution.

---

## Post-Deployment Checklist

- [ ] Visit `https://taskflowapp.site` → see the landing page
- [ ] Click "Continue with Google" → login completes → redirected to dashboard
- [ ] Create a task and subtask → appears in the Gantt grid
- [ ] Click "Sync Google Calendar" → events appear in your Google Calendar
- [ ] Click "Backup to Drive" → encrypted file appears in Google Drive
- [ ] Click "Restore from Drive" → tasks reload correctly
- [ ] Log in with your admin email → see the Shield icon in the header
