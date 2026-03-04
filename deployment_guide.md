# TaskFlow — Cloud Deployment Guide

This guide explains how to deploy TaskFlow to the public web using free-tier cloud services.

## 1. Database: MongoDB Atlas (Free Tier)
1. Sign up at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a new Project named `TaskFlow`.
3. Build a **Shared Cluster (Free Tier)**.
4. Under **Network Access**, click "Add IP Address" and select **"Allow Access from Anywhere"** (required for dynamic hosting services like Render).
5. Under **Database Access**, create a user (note the username and password).
6. Click **Connect > Drivers**, copy the `connection string`. It looks like: `mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority`

---

## 2. Backend: Render (Free Tier)
1. Sign up at [Render](https://render.com/) and connect your GitHub account.
2. Click **New + > Web Service**.
3. Select your TaskFlow repository.
4. **Settings**:
   - **Name**: `taskflow-backend`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`
5. **Environment Variables**:
   - `MONGO_URL`: Your MongoDB Atlas connection string (replace `<password>` with yours).
   - `DB_NAME`: `taskflow`
   - `GOOGLE_CLIENT_ID`: Your Google OAuth Client ID.
   - `GOOGLE_CLIENT_SECRET`: Your Google OAuth Client Secret.
   - `CORS_ORIGINS`: Your Vercel URL (add this *after* deploying frontend).

---

## 3. Frontend: Vercel (Free)
1. Sign up at [Vercel](https://vercel.com/) and connect your GitHub account.
2. Click **Add New > Project**.
3. Import your TaskFlow repo.
4. **Settings**:
   - **Project Name**: `taskflow-frontend`
   - **Framework Preset**: `Create React App`
   - **Root Directory**: `frontend`
5. **Environment Variables**:
   - `REACT_APP_BACKEND_URL`: Your Render Web Service URL (e.g., `https://taskflow-backend.onrender.com`).
6. Click **Deploy**.

---

## 4. Finalizing Google OAuth
Once both apps are deployed, you MUST update your Google Cloud Console credentials:

1. **Authorized JavaScript origins**: Add your Vercel URL (e.g., `https://taskflow-frontend.vercel.app`).
2. **Authorized redirect URIs**: Add your Render URL + `/api/auth/google/callback` (e.g., `https://taskflow-backend.onrender.com/api/auth/google/callback`).

---

## 5. Troubleshooting (Free Tier Limits)
- **Render "Spin up" Delay**: Render puts free services to sleep after 15 minutes of inactivity. When you first visit the app, it may take 30-50 seconds to respond.
- **Environment Refresh**: If you change an environment variable, you must redeploy or restart the service for it to take effect.
