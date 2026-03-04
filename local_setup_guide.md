# Local Setup & Testing Guide for TaskFlow

This guide will walk you through setting up TaskFlow on your local machine.

## Prerequisites

Before starting, ensure you have the following installed:
- **Python 3.10+**
- **Node.js 18+** and **Yarn**
- **MongoDB**: A running instance (local or MongoDB Atlas)
- **Google Cloud Project**: An active project with OAuth 2.0 credentials

---

## 1. Google Cloud Setup (Required for Login)

TaskFlow uses Google OAuth for authentication.
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing one.
3. Navigate to **APIs & Services > Credentials**.
4. Click **Create Credentials > OAuth client ID**.
5. Select **Web application**.
6. Add **Authorized JavaScript origins**: `http://localhost:3000`
7. Add **Authorized redirect URIs**: `http://localhost:8001/api/auth/google/callback`
8. Note down your **Client ID** and **Client Secret**.
9. Enable the following APIs in **Library**:
   - Google Calendar API
   - Google Drive API

---

## 2. Backend Setup

1. **Navigate to the backend directory**:
   ```powershell
   cd backend
   ```

2. **Create a virtual environment**:
   ```powershell
   python -m venv venv
   .\venv\Scripts\activate
   ```

3. **Install dependencies**:
   ```powershell
   pip install -r requirements.txt
   ```

4. **Configure Environment Variables**:
   Create a file named `.env` in the `backend/` directory:
   ```env
   MONGO_URL=mongodb://localhost:27017  # Change if using Atlas
   DB_NAME=taskflow
   GOOGLE_CLIENT_ID=your_client_id_here
   GOOGLE_CLIENT_SECRET=your_client_secret_here
   CORS_ORIGINS=http://localhost:3000
   ```

5. **Run the server**:
   ```powershell
   uvicorn server:app --reload --port 8001
   ```
   The backend will be available at `http://localhost:8001`.

---

## 3. Frontend Setup

1. **Navigate to the frontend directory**:
   ```powershell
   cd ..\frontend
   ```

2. **Install dependencies**:
   ```powershell
   yarn install
   ```

3. **Configure Environment Variables**:
   Create a file named `.env` in the `frontend/` directory:
   ```env
   REACT_APP_BACKEND_URL=http://localhost:8001
   ```

4. **Start the development server**:
   ```powershell
   yarn start
   ```
   The application should open automatically at `http://localhost:3000`.

---

## 4. Testing

### Backend Integration Tests
A test suite is provided in the root directory.
1. Ensure the backend is running.
2. Open a new terminal in the root directory.
3. Run the tests:
   ```powershell
   python backend_test.py
   ```

### Manual Verification
1. Open `http://localhost:3000`.
2. Click **"Continue with Google"**.
3. Complete the OAuth flow.
4. Try creating a Task and then adding Subtasks in the Gantt view.
5. Check if the "Sync to Google Calendar" button works.
6. Verify "Backup to Google Drive" creates a JSON file in your Drive.
