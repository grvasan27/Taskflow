# TaskFlow Project Archive: Conversation & Development History

This document serves as a persistent "memory" of the development session focused on preparing TaskFlow for production deployment.

## 📅 Session Overview (March 2026)
**Primary Objective**: Resolve authentication bugs, implement robust notifications, and ensure data integrity for production.

---

## 🛠️ Major Milestones & Technical Fixes

### 1. Robust SMTP Integration (Brevo)
- **Problem**: Emails were failing or being flagged as spam because the code used the login email as the sender.
- **Fix**: Separated `SMTP_USER` (Brevo login) from `FROM_EMAIL` (the professional sender header).
- **Outcome**: Successfully verified delivery from `updates@taskflowapp.site`. A **"Send Test Email"** button was added to the Admin Panel for future diagnostics.

### 2. Authentication & "Session Loss" Bugs
- **Problem**: Admin panel data often failed to load on the first try.
- **Root Cause**: A race condition in `App.js` where the dashboard tried to fetch data before the OAuth token was fully stored in `localStorage`.
- **Fix**: Moved token extraction to the very top of the app lifecycle. Added a retry mechanism and more detailed logging in `Dashboard.jsx`.

### 3. Data Integrity & Deduplication
- **Problem**: Users were being created multiple times, and redundant "TaskFlow Backup" folders were filling up Google Drive.
- **Normalization**: Implemented `email.strip().lower()` across all login and signup flows.
- **Database Indexing**: Enforced a `unique` index on the `email` field in MongoDB to prevent duplicates at the architectural level.
- **Drive Logic**: Added a check to reuse existing `drive_folder_id` instead of creating new ones on every login.
- **Cleanup Tool**: Added a **"Delete"** button in the Admin Panel to safely remove old duplicate records.

### 5. Production Hardening (Security)
- **Problem**: API documentation endpoints (`/docs`, `/redoc`) were exposed to the public.
- **Fix**: Implemented conditional `FastAPI` initialization that hides documentation when `ENV=prod` is set in the environment.
- **Outcome**: Improved security for the production backend.

### 4. Admin Persistence
- **Problem**: Admin status was getting lost on Render/Vercel (Access Pending bug).
- **Fix**: Created a persistent sync logic. Every time a user in the `ADMIN_EMAILS` list logs in, their `is_admin` and `is_approved` flags are automatically re-verified and updated in the database.

---

## 🚀 Production Deployment Checklist

### Google Cloud Console
1.  **OAuth Consent Screen**: Click **"Publish App"** (removes test-user limits).
2.  **Redirect URIs**:
    - `https://taskflowapp.site/dashboard`
    - `https://taskflow-7e2j.onrender.com/api/auth/callback`

### Environment Variables
- **Backend (Render)**:
  - `MONGO_URL` (Atlas URI)
  - `ADMIN_EMAILS=vasangr27@gmail.com`
  - `FRONTEND_URL=https://taskflowapp.site`
- **Frontend (Vercel)**:
  - `REACT_APP_BACKEND_URL=https://taskflow-7e2j.onrender.com`

---

## 📦 Reference Documents
- **Update Walkthrough**: [walkthrough.md](file:///C:/Users/91944/.gemini/antigravity/brain/63e82f3c-4460-463a-84ae-b2d59f6fe0a5/walkthrough.md)
- **Technical Checklist**: [task.md](file:///C:/Users/91944/.gemini/antigravity/brain/63e82f3c-4460-463a-84ae-b2d59f6fe0a5/task.md)

---
*Archive Created on 2026-03-14*
