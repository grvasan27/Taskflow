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
import httpx
import requests
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleRequest
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

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

# Google OAuth Config
GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')
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

class TaskCreate(BaseModel):
    name: str
    reminder_time: str  # HH:MM format

class TaskUpdate(BaseModel):
    name: Optional[str] = None
    reminder_time: Optional[str] = None
    is_deleted: Optional[bool] = None

class SubtaskCreate(BaseModel):
    name: str
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    notes: Optional[str] = ""

class SubtaskUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None

class DayCompletionUpdate(BaseModel):
    date: str  # YYYY-MM-DD
    completed: bool
    notes: Optional[str] = ""

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
    
    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    
    return User(**user_doc)

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
    redirect_uri = f"{base_url}/api/auth/google/callback"
    
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
    redirect_uri = f"{base_url}/api/auth/google/callback"
    
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
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        # Update tokens and info
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "name": name,
                "picture": picture,
                "google_tokens": token_data
            }}
        )
    else:
        # Create new user
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "google_tokens": token_data,
            "created_at": datetime.now(timezone.utc).isoformat()
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
    
    # Create redirect response with cookie
    redirect_response = RedirectResponse(f"{base_url}/dashboard")
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
        "created_at": datetime.now(timezone.utc).isoformat()
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
    
    tasks = await db.tasks.find(query, {"_id": 0}).sort("created_at", 1).to_list(1000)
    
    for task in tasks:
        subtasks = await db.subtasks.find(
            {"task_id": task["task_id"], "user_id": user.user_id},
            {"_id": 0}
        ).to_list(1000)
        task["subtasks"] = subtasks
        task["subtask_count"] = len(subtasks)
        
        # Calculate completed days across all subtasks
        total_days = 0
        completed_days = 0
        for s in subtasks:
            day_completions = s.get("day_completions", {})
            start = datetime.strptime(s["start_date"], "%Y-%m-%d")
            end = datetime.strptime(s["end_date"], "%Y-%m-%d")
            days_count = (end - start).days + 1
            total_days += days_count
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
        "Start Date", "End Date", "Date", "Completed", "Notes"
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
    
    # Initialize day_completions for each day in range
    day_completions = {}
    start = datetime.strptime(subtask_data.start_date, "%Y-%m-%d")
    end = datetime.strptime(subtask_data.end_date, "%Y-%m-%d")
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
        "day_completions": day_completions,
        "notes": subtask_data.notes or "",
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
    
    # Verify date is within range
    if date < subtask["start_date"] or date > subtask["end_date"]:
        raise HTTPException(status_code=400, detail="Date not within subtask range")
    
    day_completions = subtask.get("day_completions", {})
    day_completions[date] = {
        "completed": data.completed,
        "notes": data.notes or "",
        "completed_at": datetime.now(timezone.utc).isoformat() if data.completed else None
    }
    
    await db.subtasks.update_one(
        {"subtask_id": subtask_id},
        {"$set": {"day_completions": day_completions}}
    )
    
    updated_subtask = await db.subtasks.find_one({"subtask_id": subtask_id}, {"_id": 0})
    return updated_subtask

@api_router.delete("/subtasks/{subtask_id}")
async def delete_subtask(subtask_id: str, user: User = Depends(get_current_user)):
    """Delete a subtask"""
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
async def sync_to_calendar(user: User = Depends(get_current_user)):
    """Sync all subtasks to Google Calendar"""
    creds = await get_google_credentials(user.user_id)
    
    if not creds:
        raise HTTPException(status_code=400, detail="Google not connected. Please login again.")
    
    try:
        service = build('calendar', 'v3', credentials=creds)
        
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
                event_body = {
                    'summary': f"[{task['name']}] {subtask['name']}",
                    'description': f"Task: {task['name']}\nSubtask: {subtask['name']}\n\n{subtask.get('notes', '')}",
                    'start': {'date': subtask['start_date']},
                    'end': {'date': subtask['end_date']},
                    'reminders': {
                        'useDefault': False,
                        'overrides': [{'method': 'popup', 'minutes': 60}],
                    },
                }
                
                existing_event_id = subtask.get('calendar_event_id')
                
                try:
                    if existing_event_id:
                        service.events().update(
                            calendarId='primary',
                            eventId=existing_event_id,
                            body=event_body
                        ).execute()
                    else:
                        event = service.events().insert(
                            calendarId='primary',
                            body=event_body
                        ).execute()
                        
                        await db.subtasks.update_one(
                            {"subtask_id": subtask["subtask_id"]},
                            {"$set": {"calendar_event_id": event['id']}}
                        )
                    
                    synced_count += 1
                except Exception as e:
                    logger.error(f"Failed to sync subtask {subtask['subtask_id']}: {e}")
        
        return {"message": f"Synced {synced_count} subtasks to Google Calendar", "synced_count": synced_count}
    
    except Exception as e:
        logger.error(f"Calendar sync failed: {e}")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")

# ============== Google Drive Backup ==============

@api_router.post("/drive/backup")
async def backup_to_drive(user: User = Depends(get_current_user)):
    """Backup all tasks and subtasks to Google Drive"""
    creds = await get_google_credentials(user.user_id)
    
    if not creds:
        raise HTTPException(status_code=400, detail="Google not connected. Please login again.")
    
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    folder_id = user_doc.get("drive_folder_id")
    
    try:
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
                {"user_id": user.user_id},
                {"$set": {"drive_folder_id": folder_id}}
            )
        
        # Get all tasks and subtasks
        tasks = await db.tasks.find(
            {"user_id": user.user_id},
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
        
        # Upload to Drive
        file_metadata = {
            'name': f'taskflow_backup_{datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")}.json',
            'parents': [folder_id]
        }
        
        media = MediaIoBaseUpload(
            io.BytesIO(json_content.encode()),
            mimetype='application/json'
        )
        
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
    
    except Exception as e:
        logger.error(f"Drive backup failed: {e}")
        raise HTTPException(status_code=500, detail=f"Backup failed: {str(e)}")

@api_router.get("/drive/backups")
async def list_backups(user: User = Depends(get_current_user)):
    """List all backups in Google Drive"""
    creds = await get_google_credentials(user.user_id)
    
    if not creds:
        raise HTTPException(status_code=400, detail="Google not connected")
    
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    folder_id = user_doc.get("drive_folder_id")
    
    if not folder_id:
        return {"backups": []}
    
    try:
        drive_service = build('drive', 'v3', credentials=creds)
        
        results = drive_service.files().list(
            q=f"'{folder_id}' in parents and mimeType='application/json'",
            spaces='drive',
            fields='files(id, name, createdTime, webViewLink)',
            orderBy='createdTime desc'
        ).execute()
        
        files = results.get('files', [])
        
        return {"backups": files}
    
    except Exception as e:
        logger.error(f"Failed to list backups: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to list backups: {str(e)}")

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
    allow_origins=os.environ.get('CORS_ORIGINS', 'http://localhost:3000').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
