from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import JSONResponse, StreamingResponse, RedirectResponse
from dotenv import load_dotenv
import csv
import io
import json
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import time
import pytz
import smtplib
from email.message import EmailMessage
import base64
import hashlib
from cryptography.fernet import Fernet
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import httpx
import requests
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload

ROOT_DIR = Path(__file__).parent
env_path = ROOT_DIR / '.env'

if env_path.exists():
    load_dotenv(env_path)
else:
    print(f"Warning: .env file not found at {env_path}")

def get_env_var(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise KeyError(f"Critical environment variable '{name}' is missing. Please check your backend/.env file.")
    return value

# MongoDB connection
mongo_url = get_env_var('MONGO_URL')
client = AsyncIOMotorClient(mongo_url)
db = client[get_env_var('DB_NAME')]

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Permanent Admins (can be set in .env as comma-separated list)
perma_admins = os.environ.get("ADMIN_EMAILS", "").split(",")
perma_admins = [email.strip().lower() for email in perma_admins if email.strip()]

# Google OAuth Config
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')

# SMTP Config
SMTP_EMAIL = os.environ.get('SMTP_EMAIL')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD')

GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/drive.file"
]

# ============== Models ==============

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    google_tokens: Optional[Dict] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    auto_backup_enabled: Optional[bool] = False
    auto_backup_time: Optional[str] = "00:00"
    timezone: Optional[str] = "UTC"
    email_reminders_enabled: Optional[bool] = False
    email_reminder_time: Optional[str] = "08:00"
    is_approved: bool = False
    is_admin: bool = False

class TaskCreate(BaseModel):
    name: str
    reminder_time: Optional[str] = None  # deprecated, kept for compatibility

class TaskUpdate(BaseModel):
    name: Optional[str] = None
    reminder_time: Optional[str] = None
    is_deleted: Optional[bool] = None

class TaskReorderRequest(BaseModel):
    task_ids: List[str]

class SubtaskCreate(BaseModel):
    name: str
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    notes: Optional[str] = ""
    date_mode: Optional[str] = "range"  # "range" | "alternate" | "custom"
    custom_dates: Optional[List[str]] = []  # list of YYYY-MM-DD strings for custom mode
    time_slot: Optional[str] = None  # e.g. "09:00-10:00"

class SubtaskUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None
    date_mode: Optional[str] = None
    custom_dates: Optional[List[str]] = None
    time_slot: Optional[str] = None  # e.g. "09:00-10:00"

class DayCompletionUpdate(BaseModel):
    date: str  # YYYY-MM-DD
    completed: bool
    status: Optional[str] = None # "completed", "failed", "empty"
    notes: Optional[str] = ""
    time_slot: Optional[str] = None  # per-day override, e.g. "09:00-10:00"
    completed_at: Optional[str] = None  # UTC ISO string

class CalendarSyncRequest(BaseModel):
    timezone: str = "UTC"

class UserSettingsUpdate(BaseModel):
    auto_backup_enabled: bool
    auto_backup_time: str
    timezone: str = "UTC"
    email_reminders_enabled: bool = False
    email_reminder_time: str = "08:00"

class SystemSettingsUpdate(BaseModel):
    max_users: int = 1000

# ============== Crypto Helpers ==============

def get_user_fernet(key_source: str) -> Fernet:
    """Generate a deterministic Fernet key using PBKDF2 on a key source (ID or Email) + Client Secret"""
    salt = GOOGLE_CLIENT_SECRET.encode('utf-8') if GOOGLE_CLIENT_SECRET else b"taskflow_salt"
    key = hashlib.pbkdf2_hmac(
        'sha256',
        key_source.encode('utf-8'),
        salt,
        100000,
        32
    )
    return Fernet(base64.urlsafe_b64encode(key))

# ============== Auth Helpers ==============

def get_base_url(request: Request) -> str:
    """Get the base URL from request"""
    host = request.headers.get("host", "")
    # x-forwarded-proto is set by reverse proxies in production (https)
    # Locally there is no proxy, so default to http for localhost
    forwarded_proto = request.headers.get("x-forwarded-proto")
    if forwarded_proto:
        scheme = forwarded_proto
    elif "localhost" in host or "127.0.0.1" in host:
        scheme = "http"
    else:
        scheme = "https"
    return f"{scheme}://{host}"

async def get_current_user(request: Request) -> User:
    """Get current user from session token"""
    session_token = request.cookies.get("session_token")
    
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session_doc = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    expires_at = session_doc.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    user_doc = await db.users.find_one(
        {"user_id": session_doc["user_id"]},
        {"_id": 0}
    )
    
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
        
    # BACKDOOR: Force admin status if email is in the permanent list
    if user_doc.get("email", "").lower() in perma_admins:
        user_doc["is_admin"] = True
        user_doc["is_approved"] = True
        
    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    
    return User(**user_doc)

async def require_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency to check if user is an admin"""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

async def get_google_credentials(user_id: str) -> Optional[Credentials]:
    """Get Google credentials for a user, refreshing if needed"""
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    if not user_doc or not user_doc.get("google_tokens"):
        return None
    
    tokens = user_doc["google_tokens"]
    
    creds = Credentials(
        token=tokens.get('access_token'),
        refresh_token=tokens.get('refresh_token'),
        token_uri='https://oauth2.googleapis.com/token',
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=GOOGLE_SCOPES
    )
    
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(GoogleRequest())
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": {"google_tokens.access_token": creds.token}}
            )
        except Exception as e:
            logger.error(f"Failed to refresh Google token: {e}")
            return None
    
    return creds

# ============== Google OAuth Auth Endpoints ==============

@api_router.get("/auth/google/url")
async def get_google_auth_url(request: Request):
    """Get Google OAuth URL for login/signup"""
    base_url = get_base_url(request)
    # Allow override from .env for local vs production exact matches
    redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI") or f"{base_url}/api/auth/google/callback"
    
    auth_url = (
        f"https://accounts.google.com/o/oauth2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={redirect_uri}&"
        f"response_type=code&"
        f"scope={'+'.join(GOOGLE_SCOPES)}&"
        f"access_type=offline&"
        f"prompt=consent"
    )
    
    return {"authorization_url": auth_url}

@api_router.get("/auth/google/callback")
async def google_auth_callback(code: str, request: Request, response: Response):
    """Handle Google OAuth callback - login/signup"""
    base_url = get_base_url(request)
    # Must match the one sent in /auth/google/url
    redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI") or f"{base_url}/api/auth/google/callback"
    
    # Exchange code for tokens
    token_resp = requests.post('https://oauth2.googleapis.com/token', data={
        'code': code,
        'client_id': GOOGLE_CLIENT_ID,
        'client_secret': GOOGLE_CLIENT_SECRET,
        'redirect_uri': redirect_uri,
        'grant_type': 'authorization_code'
    })
    
    if token_resp.status_code != 200:
        logger.error(f"Token exchange failed: {token_resp.text}")
        return RedirectResponse(f"{base_url}/?error=auth_failed")
    
    token_data = token_resp.json()
    
    # Get user info from Google
    user_info_resp = requests.get(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        headers={'Authorization': f'Bearer {token_data["access_token"]}'}
    )
    
    if user_info_resp.status_code != 200:
        return RedirectResponse(f"{base_url}/?error=user_info_failed")
    
    user_info = user_info_resp.json()
    email = user_info.get('email')
    name = user_info.get('name')
    picture = user_info.get('picture')
    
    # Check if user exists
    user_id = None  # Initialize to avoid UnboundLocalError
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        # Update tokens and info for returning user
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "name": name,
                "picture": picture,
                "google_tokens": token_data
            }}
        )
    else:
        # New user — check limits and create account
        total_users = await db.users.count_documents({})
        is_first_user = total_users == 0

        # Check max users limit
        settings = await db.system_settings.find_one({"type": "general"})
        if not settings:
            await db.system_settings.insert_one({"type": "general", "max_users": 1000})
            max_users = 1000
        else:
            max_users = settings.get("max_users", 1000)

        if not is_first_user and total_users >= max_users:
            return RedirectResponse(url=f"{FRONTEND_URL}/?error=max_users_reached")

        # Create new user
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        is_perma_admin = email.lower() in perma_admins
        is_approved_val = is_first_user or is_perma_admin
        is_admin_val = is_first_user or is_perma_admin

        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "google_tokens": token_data,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "auto_backup_enabled": False,
            "auto_backup_time": "00:00",
            "timezone": "UTC",
            "email_reminders_enabled": False,
            "email_reminder_time": "08:00",
            "is_approved": is_approved_val,
            "is_admin": is_admin_val
        }
        await db.users.insert_one(user_doc)

        # Create TaskFlow backup folder in Drive for new user
        try:
            creds = Credentials(
                token=token_data.get('access_token'),
                refresh_token=token_data.get('refresh_token'),
                token_uri='https://oauth2.googleapis.com/token',
                client_id=GOOGLE_CLIENT_ID,
                client_secret=GOOGLE_CLIENT_SECRET,
                scopes=GOOGLE_SCOPES
            )
            drive_service = build('drive', 'v3', credentials=creds)

            folder_metadata = {
                'name': 'TaskFlow Backup',
                'mimeType': 'application/vnd.google-apps.folder'
            }
            folder = drive_service.files().create(body=folder_metadata, fields='id').execute()

            await db.users.update_one(
                {"user_id": user_id},
                {"$set": {"drive_folder_id": folder.get('id')}}
            )
        except Exception as e:
            logger.error(f"Failed to create Drive folder: {e}")

    # Safety guard: user_id must be set by this point
    if not user_id:
        logger.error("Auth callback: user_id is None after user lookup/creation. Possible DB connection issue.")
        frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
        return RedirectResponse(f"{frontend_url}/?error=auth_db_error")
    
    # Create session
    session_token = f"sess_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    
    session_doc = {
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one(session_doc)
    
    # Determine frontend URL
    frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

    # Pass session token in URL — avoids cross-site cookie restrictions
    # (cookie approach fails when frontend and backend are on different domains)
    redirect_response = RedirectResponse(f"{frontend_url}/dashboard?token={session_token}")

    # Also set cookie as fallback for local development where same-origin works
    redirect_response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )

    return redirect_response

@api_router.get("/auth/me")
async def get_me(user: User = Depends(get_current_user)):
    """Get current authenticated user"""
    user_dict = user.model_dump()
    # Don't expose tokens
    user_dict.pop('google_tokens', None)
    return user_dict

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    """Logout user"""
    session_token = request.cookies.get("session_token")
    
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    
    response.delete_cookie(
        key="session_token",
        path="/",
        secure=True,
        samesite="none"
    )
    
    return {"message": "Logged out successfully"}

@api_router.put("/auth/settings")
async def update_settings(settings: UserSettingsUpdate, user: User = Depends(get_current_user)):
    """Update settings for the current user"""
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {
            "auto_backup_enabled": settings.auto_backup_enabled,
            "auto_backup_time": settings.auto_backup_time,
            "timezone": settings.timezone,
            "email_reminders_enabled": settings.email_reminders_enabled,
            "email_reminder_time": settings.email_reminder_time
        }}
    )
    return {"message": "Settings updated"}

# ============== Admin Endpoints ==============

@api_router.get("/admin/users")
async def list_users(user: User = Depends(require_admin)):
    """List all users (Admin only)"""
    users = await db.users.find({}, {"google_tokens": 0}).to_list(1000)
    return users

@api_router.post("/admin/users/{user_id}/approve")
async def approve_user(user_id: str, admin: User = Depends(require_admin)):
    """Approve a pending user (Admin only)"""
    await db.users.update_one({"user_id": user_id}, {"$set": {"is_approved": True}})
    return {"message": "User approved"}

@api_router.post("/admin/users/{user_id}/toggle-admin")
async def toggle_admin(user_id: str, admin: User = Depends(require_admin)):
    """Toggle admin status for a user (Admin only)"""
    user = await db.users.find_one({"user_id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    new_status = not user.get("is_admin", False)
    await db.users.update_one({"user_id": user_id}, {"$set": {"is_admin": new_status}})
    return {"message": f"User admin status set to {new_status}"}

@api_router.get("/admin/settings")
async def get_admin_settings(admin: User = Depends(require_admin)):
    """Get system settings (Admin only)"""
    settings = await db.system_settings.find_one({"type": "general"})
    if not settings:
        return {"max_users": 1000}
    return settings

@api_router.put("/admin/settings")
async def update_admin_settings(settings: SystemSettingsUpdate, admin: User = Depends(require_admin)):
    """Update system settings (Admin only)"""
    await db.system_settings.update_one(
        {"type": "general"},
        {"$set": {"max_users": settings.max_users}},
        upsert=True
    )
    return {"message": "System settings updated"}

# ============== Task Endpoints ==============

@api_router.post("/tasks", status_code=201)
async def create_task(task_data: TaskCreate, user: User = Depends(get_current_user)):
    """Create a new task"""
    task_id = f"task_{uuid.uuid4().hex[:12]}"
    
    task_doc = {
        "task_id": task_id,
        "user_id": user.user_id,
        "name": task_data.name,
        "reminder_time": task_data.reminder_time,
        "is_deleted": False,
        "deleted_at": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "order": int(time.time() * 1000)
    }
    
    await db.tasks.insert_one(task_doc)
    
    return_doc = await db.tasks.find_one({"task_id": task_id}, {"_id": 0})
    return return_doc

@api_router.get("/tasks")
async def get_tasks(include_deleted: bool = False, user: User = Depends(get_current_user)):
    """Get all tasks for current user"""
    query = {"user_id": user.user_id}
    if not include_deleted:
        query["is_deleted"] = {"$ne": True}
    
    tasks = await db.tasks.find(query, {"_id": 0}).sort([("order", 1), ("created_at", 1)]).to_list(1000)
    
    for task in tasks:
        subtasks = await db.subtasks.find(
            {"task_id": task["task_id"], "user_id": user.user_id},
            {"_id": 0}
        ).to_list(1000)
        task["subtasks"] = subtasks
        task["subtask_count"] = len(subtasks)
        
        # Calculate completed days across all subtasks
        # Use len(day_completions) for total so alternate/custom modes are correctly counted
        total_days = 0
        completed_days = 0
        for s in subtasks:
            day_completions = s.get("day_completions", {})
            total_days += len(day_completions)  # actual active days, not raw date range
            completed_days += len([d for d, v in day_completions.items() if v.get("completed")])
        
        task["total_days"] = total_days
        task["completed_days"] = completed_days
    
    return tasks

@api_router.get("/tasks/bin")
async def get_deleted_tasks(user: User = Depends(get_current_user)):
    """Get all deleted tasks (bin)"""
    tasks = await db.tasks.find(
        {"user_id": user.user_id, "is_deleted": True},
        {"_id": 0}
    ).sort("deleted_at", -1).to_list(1000)
    
    return tasks

@api_router.get("/tasks/export/csv")
async def export_tasks_csv(user: User = Depends(get_current_user)):
    """Export all tasks and subtasks to CSV"""
    tasks = await db.tasks.find(
        {"user_id": user.user_id, "is_deleted": {"$ne": True}},
        {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        "Task Name", "Reminder Time", "Subtask Name", 
        "Start Date", "End Date", "Date", "Completed", "Completed At", "Notes"
    ])
    
    for task in tasks:
        subtasks = await db.subtasks.find(
            {"task_id": task["task_id"], "user_id": user.user_id},
            {"_id": 0}
        ).to_list(1000)
        
        if subtasks:
            for subtask in subtasks:
                day_completions = subtask.get("day_completions", {})
                start = datetime.strptime(subtask["start_date"], "%Y-%m-%d")
                end = datetime.strptime(subtask["end_date"], "%Y-%m-%d")
                current = start
                while current <= end:
                    date_str = current.strftime("%Y-%m-%d")
                    day_data = day_completions.get(date_str, {})
                    writer.writerow([
                        task["name"],
                        task["reminder_time"],
                        subtask["name"],
                        subtask["start_date"],
                        subtask["end_date"],
                        date_str,
                        "Yes" if day_data.get("completed") else "No",
                        day_data.get("completed_at", ""),
                        day_data.get("notes", "")
                    ])
                    current += timedelta(days=1)
        else:
            writer.writerow([task["name"], task["reminder_time"], "", "", "", "", "", ""])
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=taskflow_export_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
        }
    )

@api_router.get("/tasks/{task_id}")
async def get_task(task_id: str, user: User = Depends(get_current_user)):
    """Get a specific task"""
    task = await db.tasks.find_one(
        {"task_id": task_id, "user_id": user.user_id},
        {"_id": 0}
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    subtasks = await db.subtasks.find(
        {"task_id": task_id, "user_id": user.user_id},
        {"_id": 0}
    ).to_list(1000)
    task["subtasks"] = subtasks
    
    return task
async def queue_calendar_deletes(user_id: str, event_ids: List[str]):
    if event_ids:
        await db.users.update_one(
            {"user_id": user_id},
            {"$push": {"pending_calendar_deletes": {"$each": event_ids}}}
        )

@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, task_data: TaskUpdate, user: User = Depends(get_current_user)):
    """Update a task"""
    update_dict = {k: v for k, v in task_data.model_dump().items() if v is not None}
    
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = await db.tasks.update_one(
        {"task_id": task_id, "user_id": user.user_id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    
    updated_task = await db.tasks.find_one({"task_id": task_id}, {"_id": 0})
    return updated_task

@api_router.delete("/tasks/{task_id}")
async def soft_delete_task(task_id: str, user: User = Depends(get_current_user)):
    """Soft delete a task (move to bin)"""
    result = await db.tasks.update_one(
        {"task_id": task_id, "user_id": user.user_id},
        {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
        
    # Queue all subtask calendar events for deletion, and unset them from the subtasks
    subtasks = await db.subtasks.find({"task_id": task_id, "user_id": user.user_id}).to_list(1000)
    event_ids_to_delete = []
    for subtask in subtasks:
        if subtask.get("calendar_event_id"):
            event_ids_to_delete.append(subtask["calendar_event_id"])
        if subtask.get("calendar_event_ids"):
            event_ids_to_delete.extend(list(subtask["calendar_event_ids"].values()))
            
    await queue_calendar_deletes(user.user_id, event_ids_to_delete)
    await db.subtasks.update_many(
        {"task_id": task_id, "user_id": user.user_id},
        {"$unset": {"calendar_event_id": "", "calendar_event_ids": ""}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {"message": "Task moved to bin"}

@api_router.post("/tasks/{task_id}/restore")
async def restore_task(task_id: str, user: User = Depends(get_current_user)):
    """Restore a task from bin"""
    result = await db.tasks.update_one(
        {"task_id": task_id, "user_id": user.user_id, "is_deleted": True},
        {"$set": {"is_deleted": False, "deleted_at": None}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found in bin")
    
    return {"message": "Task restored successfully"}

@api_router.delete("/tasks/{task_id}/permanent")
async def permanent_delete_task(task_id: str, user: User = Depends(get_current_user)):
    """Permanently delete a task and its subtasks"""
    result = await db.tasks.delete_one({"task_id": task_id, "user_id": user.user_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Queue subtask calendar events for deletion before removing them
    subtasks = await db.subtasks.find({"task_id": task_id, "user_id": user.user_id}).to_list(1000)
    event_ids_to_delete = []
    for subtask in subtasks:
        if subtask.get("calendar_event_id"):
            event_ids_to_delete.append(subtask["calendar_event_id"])
        if subtask.get("calendar_event_ids"):
            event_ids_to_delete.extend(list(subtask["calendar_event_ids"].values()))
            
    await queue_calendar_deletes(user.user_id, event_ids_to_delete)
    await db.subtasks.delete_many({"task_id": task_id})
    
    return {"message": "Task permanently deleted"}

# ============== Subtask Endpoints ==============

@api_router.post("/tasks/{task_id}/subtasks", status_code=201)
async def create_subtask(task_id: str, subtask_data: SubtaskCreate, user: User = Depends(get_current_user)):
    """Create a subtask for a task"""
    task = await db.tasks.find_one(
        {"task_id": task_id, "user_id": user.user_id},
        {"_id": 0}
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    subtask_id = f"subtask_{uuid.uuid4().hex[:12]}"
    date_mode = subtask_data.date_mode or "range"
    custom_dates = subtask_data.custom_dates or []

    # Initialize day_completions only for ACTIVE dates based on date_mode
    day_completions = {}
    start = datetime.strptime(subtask_data.start_date, "%Y-%m-%d")
    end = datetime.strptime(subtask_data.end_date, "%Y-%m-%d")

    if date_mode == "custom":
        # Only the explicitly selected dates
        for date_str in custom_dates:
            day_completions[date_str] = {"completed": False, "notes": "", "completed_at": None}
    elif date_mode == "alternate":
        # Every other day starting from start_date
        current = start
        step = 0
        while current <= end:
            if step % 2 == 0:
                date_str = current.strftime("%Y-%m-%d")
                day_completions[date_str] = {"completed": False, "notes": "", "completed_at": None}
            current += timedelta(days=1)
            step += 1
    else:
        # range mode — every day
        current = start
        while current <= end:
            date_str = current.strftime("%Y-%m-%d")
            day_completions[date_str] = {"completed": False, "notes": "", "completed_at": None}
            current += timedelta(days=1)

    subtask_doc = {
        "subtask_id": subtask_id,
        "task_id": task_id,
        "user_id": user.user_id,
        "name": subtask_data.name,
        "start_date": subtask_data.start_date,
        "end_date": subtask_data.end_date,
        "date_mode": date_mode,
        "custom_dates": custom_dates,
        "day_completions": day_completions,
        "notes": subtask_data.notes or "",
        "time_slot": subtask_data.time_slot or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    await db.subtasks.insert_one(subtask_doc)

    return_doc = await db.subtasks.find_one({"subtask_id": subtask_id}, {"_id": 0})
    return return_doc

@api_router.get("/tasks/{task_id}/subtasks")
async def get_subtasks(task_id: str, user: User = Depends(get_current_user)):
    """Get all subtasks for a task"""
    task = await db.tasks.find_one(
        {"task_id": task_id, "user_id": user.user_id},
        {"_id": 0}
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    subtasks = await db.subtasks.find(
        {"task_id": task_id, "user_id": user.user_id},
        {"_id": 0}
    ).sort("start_date", 1).to_list(1000)
    
    return subtasks

@api_router.put("/subtasks/{subtask_id}")
async def update_subtask(subtask_id: str, subtask_data: SubtaskUpdate, user: User = Depends(get_current_user)):
    """Update a subtask"""
    update_dict = {}
    
    for k, v in subtask_data.model_dump().items():
        if v is not None:
            update_dict[k] = v
    
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    # If date range changed, update day_completions
    if "start_date" in update_dict or "end_date" in update_dict:
        existing = await db.subtasks.find_one({"subtask_id": subtask_id}, {"_id": 0})
        if existing:
            new_start = update_dict.get("start_date", existing["start_date"])
            new_end = update_dict.get("end_date", existing["end_date"])
            
            old_completions = existing.get("day_completions", {})
            new_completions = {}
            
            start = datetime.strptime(new_start, "%Y-%m-%d")
            end = datetime.strptime(new_end, "%Y-%m-%d")
            current = start
            while current <= end:
                date_str = current.strftime("%Y-%m-%d")
                if date_str in old_completions:
                    new_completions[date_str] = old_completions[date_str]
                else:
                    new_completions[date_str] = {"completed": False, "notes": "", "completed_at": None}
                current += timedelta(days=1)
            
            update_dict["day_completions"] = new_completions
    
    result = await db.subtasks.update_one(
        {"subtask_id": subtask_id, "user_id": user.user_id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    updated_subtask = await db.subtasks.find_one({"subtask_id": subtask_id}, {"_id": 0})
    return updated_subtask

@api_router.put("/subtasks/{subtask_id}/day/{date}")
async def update_day_completion(
    subtask_id: str, 
    date: str, 
    data: DayCompletionUpdate, 
    user: User = Depends(get_current_user)
):
    """Update completion status for a specific day"""
    subtask = await db.subtasks.find_one(
        {"subtask_id": subtask_id, "user_id": user.user_id},
        {"_id": 0}
    )
    
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    # Verify date is valid for this subtask's date_mode
    date_mode = subtask.get("date_mode", "range")
    if date_mode == "custom":
        custom_dates = subtask.get("custom_dates", [])
        if date not in custom_dates:
            raise HTTPException(status_code=400, detail="Date not in custom date list")
    else:
        if date < subtask["start_date"] or date > subtask["end_date"]:
            raise HTTPException(status_code=400, detail="Date not within subtask range")
    
    day_completions = subtask.get("day_completions", {})
    existing = day_completions.get(date, {})
    day_entry = {
        "completed": data.completed,
        "status": data.status or ("completed" if data.completed else "empty"),
        "notes": data.notes or ""
    }
    
    # Handle completed_at rules:
    # 1. If explicit input given, save it.
    # 2. If transitioning from uncompleted->completed and no input, use current time.
    # 3. If remaining completed and no new input, preserve exact existing timestamp.
    # 4. If transitioning to uncompleted/failed, strip the timestamp completely.
    if data.completed:
        if data.completed_at:
            day_entry["completed_at"] = data.completed_at
        elif existing.get("completed_at"):
            day_entry["completed_at"] = existing["completed_at"]
        else:
            day_entry["completed_at"] = datetime.now(timezone.utc).isoformat()
    else:
        day_entry["completed_at"] = None
    # Preserve existing per-day time_slot, or update if a new one is provided
    if data.time_slot is not None:
        day_entry["time_slot"] = data.time_slot
    elif "time_slot" in existing:
        day_entry["time_slot"] = existing["time_slot"]
    day_completions[date] = day_entry
    
    await db.subtasks.update_one(
        {"subtask_id": subtask_id},
        {"$set": {"day_completions": day_completions}}
    )
    
    updated_subtask = await db.subtasks.find_one({"subtask_id": subtask_id}, {"_id": 0})
    return updated_subtask

@api_router.delete("/subtasks/{subtask_id}")
async def delete_subtask(subtask_id: str, user: User = Depends(get_current_user)):
    """Delete a subtask"""
    # Grab event IDs before deletion
    subtask = await db.subtasks.find_one({"subtask_id": subtask_id, "user_id": user.user_id})
    if subtask:
        event_ids_to_delete = []
        if subtask.get("calendar_event_id"):
            event_ids_to_delete.append(subtask["calendar_event_id"])
        if subtask.get("calendar_event_ids"):
            event_ids_to_delete.extend(list(subtask["calendar_event_ids"].values()))
        await queue_calendar_deletes(user.user_id, event_ids_to_delete)
        
    result = await db.subtasks.delete_one({"subtask_id": subtask_id, "user_id": user.user_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    return {"message": "Subtask deleted successfully"}

# ============== Google Calendar Sync ==============

@api_router.get("/calendar/status")
async def get_calendar_status(user: User = Depends(get_current_user)):
    """Check if Google services are connected"""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    
    has_tokens = bool(user_doc and user_doc.get("google_tokens"))
    
    return {
        "connected": has_tokens,
        "email": user_doc.get("email") if has_tokens else None,
        "drive_folder_id": user_doc.get("drive_folder_id") if has_tokens else None
    }

@api_router.post("/calendar/sync")
async def sync_to_calendar(request: CalendarSyncRequest, user: User = Depends(get_current_user)):
    """Sync all subtasks to Google Calendar as daily events"""
    creds = await get_google_credentials(user.user_id)
    
    if not creds:
        raise HTTPException(status_code=400, detail="Google not connected. Please login again.")
    
    try:
        service = build('calendar', 'v3', credentials=creds)
        
        # Process pending deletions first
        user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
        pending_deletes = user_doc.get("pending_calendar_deletes", [])
        if pending_deletes:
            for event_id in pending_deletes:
                try:
                    service.events().delete(calendarId='primary', eventId=event_id).execute()
                except Exception as e:
                    logger.warning(f"Failed to delete pending event {event_id}: {e}")
            
            await db.users.update_one(
                {"user_id": user.user_id},
                {"$set": {"pending_calendar_deletes": []}}
            )
        
        tasks = await db.tasks.find(
            {"user_id": user.user_id, "is_deleted": {"$ne": True}},
            {"_id": 0}
        ).to_list(1000)
        
        synced_count = 0
        
        for task in tasks:
            subtasks = await db.subtasks.find(
                {"task_id": task["task_id"], "user_id": user.user_id},
                {"_id": 0}
            ).to_list(1000)
            
            for subtask in subtasks:
                date_mode = subtask.get("date_mode", "range")
                start_dt = datetime.strptime(subtask["start_date"], "%Y-%m-%d")
                end_dt = datetime.strptime(subtask["end_date"], "%Y-%m-%d")
                
                # Determine active dates
                active_dates = []
                if date_mode == "custom":
                    active_dates = subtask.get("custom_dates", [])
                else:
                    curr = start_dt
                    idx = 0
                    while curr <= end_dt:
                        if date_mode == "alternate" and idx % 2 != 0:
                            idx += 1
                            curr += timedelta(days=1)
                            continue
                        active_dates.append(curr.strftime("%Y-%m-%d"))
                        idx += 1
                        curr += timedelta(days=1)
                
                # Dictionary of existing events for this subtask
                calendar_event_ids = subtask.get('calendar_event_ids', {})
                old_calendar_event_id = subtask.get('calendar_event_id') # Legacy
                
                # Cleanup legacy single event if present
                if old_calendar_event_id:
                    try:
                        service.events().delete(calendarId='primary', eventId=old_calendar_event_id).execute()
                    except Exception:
                        pass
                    await db.subtasks.update_one(
                        {"subtask_id": subtask["subtask_id"]},
                        {"$unset": {"calendar_event_id": ""}}
                    )

                new_event_ids = {}
                
                for date_str in active_dates:
                    day_completion = subtask.get("day_completions", {}).get(date_str, {})
                    time_slot = day_completion.get("time_slot") or subtask.get("time_slot")
                    notes = day_completion.get("notes") or subtask.get("notes", "")
                    
                    event_body = {
                        'summary': f"[{task['name']}] {subtask['name']}",
                        'description': f"Task: {task['name']}\nSubtask: {subtask['name']}\n\n{notes}",
                        'reminders': {
                            'useDefault': False,
                            'overrides': [{'method': 'popup', 'minutes': 60}],
                        },
                    }
                    
                    if time_slot and "-" in time_slot:
                        try:
                            t1, t2 = time_slot.split("-")
                            event_body['start'] = {'dateTime': f"{date_str}T{t1}:00", 'timeZone': request.timezone}
                            event_body['end'] = {'dateTime': f"{date_str}T{t2}:00", 'timeZone': request.timezone}
                        except Exception:
                            event_body['start'] = {'date': date_str}
                            next_day_str = (datetime.strptime(date_str, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
                            event_body['end'] = {'date': next_day_str}
                    else:
                        event_body['start'] = {'date': date_str}
                        next_day_str = (datetime.strptime(date_str, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
                        event_body['end'] = {'date': next_day_str}
                        
                    existing_event_id = calendar_event_ids.get(date_str)
                    
                    try:
                        if existing_event_id:
                            service.events().update(
                                calendarId='primary',
                                eventId=existing_event_id,
                                body=event_body
                            ).execute()
                            new_event_ids[date_str] = existing_event_id
                        else:
                            event = service.events().insert(
                                calendarId='primary',
                                body=event_body
                            ).execute()
                            new_event_ids[date_str] = event['id']
                        
                        synced_count += 1
                    except Exception as e:
                        logger.error(f"Failed to sync subtask {subtask['subtask_id']} on {date_str}: {e}")
                
                # Clean up any events for dates that are no longer active
                for old_date, old_id in calendar_event_ids.items():
                    if old_date not in active_dates:
                        try:
                            service.events().delete(calendarId='primary', eventId=old_id).execute()
                        except Exception:
                            pass
                
                await db.subtasks.update_one(
                    {"subtask_id": subtask["subtask_id"]},
                    {"$set": {"calendar_event_ids": new_event_ids}}
                )
        
        return {"message": f"Synced {synced_count} daily events to Google Calendar", "synced_count": synced_count}
    
    except Exception as e:
        logger.error(f"Calendar sync failed: {e}")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")

# ============== Google Drive Backup ==============

async def perform_drive_backup(user_id: str):
    """Core backup logically extracted so it can run via API or chron"""
    creds = await get_google_credentials(user_id)
    if not creds:
        raise Exception("Google not connected.")
    
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    folder_id = user_doc.get("drive_folder_id")
    
    drive_service = build('drive', 'v3', credentials=creds)
    
    # Create folder if doesn't exist
    if not folder_id:
        folder_metadata = {
            'name': 'TaskFlow Backup',
            'mimeType': 'application/vnd.google-apps.folder'
        }
        folder = drive_service.files().create(body=folder_metadata, fields='id').execute()
        folder_id = folder.get('id')
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"drive_folder_id": folder_id}}
        )
    
    # Get all tasks and subtasks
    tasks = await db.tasks.find(
        {"user_id": user_id},
        {"_id": 0}
    ).to_list(1000)
    
    for task in tasks:
        subtasks = await db.subtasks.find(
            {"task_id": task["task_id"]},
            {"_id": 0}
        ).to_list(1000)
        task["subtasks"] = subtasks
    
    # Create JSON backup
    backup_data = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "user_email": user_doc.get("email"),
        "tasks": tasks
    }
    
    json_content = json.dumps(backup_data, indent=2, default=str)
    # Use email as a stable encryption key source instead of fragile user_id
    fernet = get_user_fernet(user_doc.get("email"))
    encrypted_content = fernet.encrypt(json_content.encode('utf-8'))
    
    # Check for existing backup to overwrite
    existing_file_id = None
    results = drive_service.files().list(
        q=f"'{folder_id}' in parents and name='taskflow_backup.json' and not trashed",
        spaces='drive',
        fields='files(id, name)'
    ).execute()
    items = results.get('files', [])
    if items:
        existing_file_id = items[0]['id']
    
    # Upload to Drive
    file_metadata = {
        'name': 'taskflow_backup.json'
    }
    
    media = MediaIoBaseUpload(
        io.BytesIO(encrypted_content),
        mimetype='application/octet-stream'
    )
    
    if existing_file_id:
        file = drive_service.files().update(
            fileId=existing_file_id,
            media_body=media,
            fields='id, name, webViewLink'
        ).execute()
    else:
        file_metadata['parents'] = [folder_id]
        file = drive_service.files().create(
            body=file_metadata,
            media_body=media,
            fields='id, name, webViewLink'
        ).execute()
    
    return {
        "message": "Backup created successfully",
        "file_name": file.get('name'),
        "file_id": file.get('id'),
        "view_link": file.get('webViewLink')
    }

@api_router.post("/drive/backup")
async def backup_to_drive(user: User = Depends(get_current_user)):
    """Backup all tasks and subtasks to Google Drive via API"""
    try:
        result = await perform_drive_backup(user.user_id)
        return result
    except Exception as e:
        logger.error(f"Drive backup failed: {e}")
        error_msg = str(e)
        if hasattr(e, "detail"): return e
        if "Google not connected" in error_msg: raise HTTPException(status_code=400, detail=error_msg)
        raise HTTPException(status_code=500, detail=f"Backup failed: {error_msg}")


@api_router.post("/drive/restore")
async def restore_from_drive(user: User = Depends(get_current_user)):
    """Restore tasks from the latest Google Drive backup"""
    creds = await get_google_credentials(user.user_id)
    
    if not creds:
        raise HTTPException(status_code=400, detail="Google not connected.")
    
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    folder_id = user_doc.get("drive_folder_id")
    
    if not folder_id:
        raise HTTPException(status_code=404, detail="No TaskFlow Backup folder found.")
        
    try:
        drive_service = build('drive', 'v3', credentials=creds)
        
        results = drive_service.files().list(
            q=f"'{folder_id}' in parents and name='taskflow_backup.json' and not trashed",
            spaces='drive',
            fields='files(id, name)'
        ).execute()
        
        items = results.get('files', [])
        if not items:
            raise HTTPException(status_code=404, detail="No backup file found in Google Drive.")
            
        file_id = items[0]['id']
        
        request = drive_service.files().get_media(fileId=file_id)
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while done is False:
            status, done = downloader.next_chunk()
        encrypted_content = fh.getvalue()
        
        # --- Multi-ID Decryption Rescue Strategy ---
        json_content = None
        potential_keys = [user.user_id, user.email]
        
        # Find all historical user_ids for this email to try as well
        other_accounts = await db.users.find({"email": user.email}).to_list(100)
        for acc in other_accounts:
            uid = acc.get("user_id")
            if uid not in potential_keys:
                potential_keys.append(uid)
        
        for key_source in potential_keys:
            try:
                fernet = get_user_fernet(key_source)
                json_content = fernet.decrypt(encrypted_content).decode('utf-8')
                logger.info(f"Successfully decrypted backup using key source: {key_source}")
                break
            except Exception:
                continue
        
        if not json_content:
            # Final fallback for old unencrypted backups
            try:
                json_content = encrypted_content.decode('utf-8')
            except:
                raise HTTPException(status_code=400, detail="Backup file is corrupted or belongs to a different user identity.")
                
        backup_data = json.loads(json_content)
        
        tasks_to_insert = backup_data.get("tasks", [])
        
        # Clear existing
        await db.tasks.delete_many({"user_id": user.user_id})
        await db.subtasks.delete_many({"user_id": user.user_id})
        
        subtasks_to_insert = []
        for task in tasks_to_insert:
            if "subtasks" in task:
                task_subtasks = task.pop("subtasks")
                subtasks_to_insert.extend(task_subtasks)
        
        if tasks_to_insert:
            await db.tasks.insert_many(tasks_to_insert)
        if subtasks_to_insert:
            await db.subtasks.insert_many(subtasks_to_insert)
            
        return {"message": "Data restored successfully from Google Drive"}
        
    except Exception as e:
        logger.error(f"Drive restore failed: {e}")
        raise HTTPException(status_code=500, detail=f"Restore failed: {str(e)}")

# ============== Health Check ==============

@api_router.get("/")
async def root():
    return {"message": "TaskFlow API", "status": "healthy"}

@api_router.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "https://taskflow2-xi.vercel.app",
        "https://www.taskflowapp.site",
        "https://taskflowapp.site",
        "https://taskflow-7e2j.onrender.com",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def setup_scheduler():
    global scheduler
    scheduler = AsyncIOScheduler()
    scheduler.add_job(auto_backup_job, CronTrigger(minute="*")) # Runs every minute to check all users' scheduled times
    scheduler.add_job(daily_email_job, CronTrigger(minute="*"))
    scheduler.start()
    logger.info("APScheduler background tasks started.")

async def auto_backup_job():
    logger.info("Running auto_backup_job check...")
    try:
        # Find all users that want auto-backups
        users = await db.users.find({
            "auto_backup_enabled": True
        }).to_list(1000)
        
        for user_doc in users:
            try:
                tz_str = user_doc.get("timezone", "UTC")
                try:
                    user_tz = pytz.timezone(tz_str)
                except Exception:
                    user_tz = timezone.utc
                    
                user_time_str = datetime.now(user_tz).strftime("%H:%M")
                
                if user_time_str == user_doc.get("auto_backup_time"):
                    logger.info(f"Triggering auto-backup for user {user_doc.get('email', 'unknown')}")
                    await perform_drive_backup(user_doc["user_id"])
            except Exception as e:
                logger.error(f"Auto-backup failed for user {user_doc.get('email', 'unknown')}: {e}")
                
    except Exception as e:
        logger.error(f"Failed in auto_backup_job cycle: {e}")

async def send_email(to_email: str, subject: str, html_content: str):
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        logger.error("SMTP_EMAIL or SMTP_PASSWORD not set in environment.")
        return False
        
    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = f"TaskFlow <{SMTP_EMAIL}>"
    msg['To'] = to_email
    msg.add_alternative(html_content, subtype='html')

    try:
        with smtplib.SMTP('smtp.gmail.com', 587) as server:
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.send_message(msg)
            logger.info(f"Successfully sent email to {to_email}")
            return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False

async def generate_daily_summary(user_doc: dict):
    user_id = user_doc["user_id"]
    tz_str = user_doc.get("timezone", "UTC")
    try:
        user_tz = pytz.timezone(tz_str)
    except Exception:
        user_tz = timezone.utc
        
    local_now = datetime.now(user_tz)
    today_str = local_now.strftime("%Y-%m-%d")
    
    tasks = await db.tasks.find({"user_id": user_id, "is_deleted": {"$ne": True}}).to_list(1000)
    
    due_today = []
    overdue = []
    
    for task in tasks:
        subtasks = await db.subtasks.find({"task_id": task["task_id"]}).to_list(1000)
        task_has_overdue = False
        
        for st in subtasks:
            start_date = st["start_date"]
            end_date = st["end_date"]
            day_completions = st.get("day_completions", {})
            done_today = day_completions.get(today_str, {}).get("completed", False)
            
            if start_date <= today_str <= end_date and not done_today:
                due_today.append(f"<li><b>{task['name']}:</b> {st['name']}</li>")
                
            if end_date < today_str:
                # Check if it was completed on its end_date
                done_end_date = day_completions.get(end_date, {}).get("completed", False)
                if not done_end_date:
                    task_has_overdue = True
                    
        if task_has_overdue:
            overdue.append(f"<li><b>{task['name']}</b></li>")
            
    if not due_today and not overdue:
        logger.info(f"No active tasks for {user_doc.get('email')}, skipping email.")
        return
        
    html = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color: #4f46e5;">TaskFlow Daily Summary</h2>
        <p>Here is your schedule for <b>{local_now.strftime('%A, %B %d')}</b>:</p>
    """
    
    if due_today:
        html += "<h3>🎯 Due Today</h3><ul>" + "".join(due_today) + "</ul>"
    
    if overdue:
        html += "<h3 style='color: #ef4444;'>⚠️ Overdue Tasks</h3><ul>" + "".join(overdue) + "</ul>"
        
    html += """
        <br/><p>Have a productive day!</p>
        <p style="font-size: 12px; color: #888;"><i>Sent from your TaskFlow Assistant</i></p>
      </body>
    </html>
    """
    
    await send_email(user_doc["email"], f"TaskFlow Summary: {local_now.strftime('%b %d')}", html)

async def daily_email_job():
    logger.info("Running daily_email_job check...")
    try:
        users = await db.users.find({
            "email_reminders_enabled": True
        }).to_list(1000)
        
        for user_doc in users:
            try:
                tz_str = user_doc.get("timezone", "UTC")
                try:
                    user_tz = pytz.timezone(tz_str)
                except Exception:
                    user_tz = timezone.utc
                    
                user_time_str = datetime.now(user_tz).strftime("%H:%M")
                
                if user_time_str == user_doc.get("email_reminder_time"):
                    logger.info(f"Triggering daily email for user {user_doc.get('email', 'unknown')}")
                    await generate_daily_summary(user_doc)
            except Exception as e:
                logger.error(f"Email job failed for user {user_doc.get('email', 'unknown')}: {e}")
                
    except Exception as e:
        logger.error(f"Failed in daily_email_job cycle: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    if 'scheduler' in globals():
        scheduler.shutdown()
    client.close()
