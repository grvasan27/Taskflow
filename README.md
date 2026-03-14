<div align="center">

# TaskFlow

**A visual Gantt-style daily task tracker with Google ecosystem integrations.**

[![Live](https://img.shields.io/badge/Live-taskflowapp.site-blue?style=for-the-badge)](https://taskflowapp.site)
[![Backend](https://img.shields.io/badge/API-Render.com-green?style=for-the-badge)](https://taskflow-7e2j.onrender.com/api/health)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| 📅 Gantt Grid | Scrollable day-by-day visual task timeline |
| ✅ Day Checkboxes | Mark each subtask as done per calendar day |
| 📝 Per-Day Notes | Attach notes and timestamps to any individual day |
| 🔔 Reminders | Browser push notifications at your configured time |
| 📆 Google Calendar Sync | Sync subtasks as Google Calendar events |
| ☁️ Google Drive Backup | Encrypted JSON backup to your Google Drive |
| 📊 CSV Export | Download all task/subtask/day data |
| 🗑️ Recycle Bin | Soft-delete with restore or permanent delete |
| 🌙 Dark / Light / System | Theme syncs with your OS preference |
| 🛡️ Admin Panel | Approve/reject new user signups, manage user limits |
| 🔒 Restricted Signup | New users require admin approval before access |

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Tailwind CSS, shadcn/ui, Framer Motion |
| **Backend** | FastAPI (Python), Gunicorn, Uvicorn |
| **Database** | MongoDB Atlas |
| **Hosting** | Vercel (frontend) + Render (backend) |
| **Auth** | Google OAuth 2.0 (no passwords) |
| **Integrations** | Google Calendar API, Google Drive API |

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 18+ and yarn
- Python 3.10+
- A MongoDB database (local or Atlas free tier)
- A Google Cloud project with OAuth 2.0 credentials

### 1. Clone the repo
```bash
git clone https://github.com/YOUR-USERNAME/Taskflow.git
cd Taskflow
```

### 2. Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Create environment file
cp .env.example .env
# Edit .env with your values (see below)

# Start the backend
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
yarn install

# Create environment file
echo "REACT_APP_BACKEND_URL=http://localhost:8000" > .env

# Start the frontend
yarn start
```

Open `http://localhost:3000` in your browser.

---

## ⚙️ Environment Variables

### Backend (`backend/.env`)
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=taskflow

GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback

FRONTEND_URL=http://localhost:3000

# Admin access — always approved, bypasses pending screen
ADMIN_EMAILS=your@email.com

# Email reminders (use a Gmail App Password)
SMTP_EMAIL=your@gmail.com
SMTP_PASSWORD=your-app-password
```

### Frontend (`frontend/.env`)
```env
REACT_APP_BACKEND_URL=http://localhost:8000
```

---

## 🌍 Production Deployment

This app is deployed on:
- **Frontend → Vercel** at `taskflowapp.site`
- **Backend → Render** at `taskflow-7e2j.onrender.com`
- **Database → MongoDB Atlas** (M0 Free Tier)

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for full production setup instructions.

---

## 📚 Documentation

| Document | Description |
|---|---|
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment guide (Vercel + Render + Atlas) |
| [taskflow_documentation.md](taskflow_documentation.md) | Full technical documentation with API reference and architecture |

---

## 🛡️ Admin Guide

When the first user signs up they become the administrator. To make yourself admin at any time, add your email to the `ADMIN_EMAILS` environment variable in the backend.

As admin you can:
- Approve or reject new user signups
- Remove users from the platform
- Toggle admin status for other users
- Configure the maximum user limit

---

## 🔒 Security

- No passwords are stored — login is 100% through Google OAuth 2.0
- Session tokens are stored in `HttpOnly` cookies (inaccessible to JavaScript)
- All API queries filter by `user_id` — users can only see their own data
- Backups are **encrypted** using a key derived from your identity before upload to Drive

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
