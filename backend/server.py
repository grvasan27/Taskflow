from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.responses import JSONResponse, StreamingResponse, RedirectResponse
from dotenv import load_dotenv
import csv
import io
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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

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

# ============== Models ==============

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TaskCreate(BaseModel):
    name: str
    reminder_time: str  # HH:MM format

class TaskUpdate(BaseModel):
    name: Optional[str] = None
    reminder_time: Optional[str] = None
    is_deleted: Optional[bool] = None

class Task(BaseModel):
    model_config = ConfigDict(extra="ignore")
    task_id: str
    user_id: str
    name: str
    reminder_time: str
    daily_progress: Dict[str, Dict[str, Any]] = {}  # {"2025-01-01": {"completed": true, "completed_at": "...", "notes": "..."}}
    is_deleted: bool = False
    deleted_at: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SubtaskCreate(BaseModel):
    name: str
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    notes: Optional[str] = ""

class SubtaskUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    completed: Optional[bool] = None
    completed_at: Optional[str] = None
    notes: Optional[str] = None

class Subtask(BaseModel):
    model_config = ConfigDict(extra="ignore")
    subtask_id: str
    task_id: str
    user_id: str
    name: str
    start_date: str
    end_date: str
    completed: bool = False
    completed_at: Optional[str] = None
    notes: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class DailyProgressUpdate(BaseModel):
    date: str  # YYYY-MM-DD
    completed: bool
    notes: Optional[str] = ""

# ============== Auth Helpers ==============

async def get_current_user(request: Request) -> User:
    """Get current user from session token (cookie or header)"""
    session_token = request.cookies.get("session_token")
    
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Find session
    session_doc = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Check expiry with timezone awareness
    expires_at = session_doc.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    # Get user
    user_doc = await db.users.find_one(
        {"user_id": session_doc["user_id"]},
        {"_id": 0}
    )
    
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    
    # Convert datetime if string
    if isinstance(user_doc.get("created_at"), str):
        user_doc["created_at"] = datetime.fromisoformat(user_doc["created_at"])
    
    return User(**user_doc)

# ============== Auth Endpoints ==============

@api_router.post("/auth/session")
async def create_session(request: Request, response: Response):
    """Exchange session_id for session_token"""
    body = await request.json()
    session_id = body.get("session_id")
    
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")
    
    # Call Emergent Auth to validate session_id
    async with httpx.AsyncClient() as client_http:
        try:
            auth_response = await client_http.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id},
                timeout=10.0
            )
            
            if auth_response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid session_id")
            
            auth_data = auth_response.json()
        except httpx.RequestError as e:
            logger.error(f"Auth request failed: {e}")
            raise HTTPException(status_code=500, detail="Authentication service unavailable")
    
    email = auth_data.get("email")
    name = auth_data.get("name")
    picture = auth_data.get("picture")
    session_token = auth_data.get("session_token")
    
    if not email or not session_token:
        raise HTTPException(status_code=400, detail="Invalid auth response")
    
    # Check if user exists, create or update
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        # Update user info if needed
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}}
        )
    else:
        # Create new user
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user_doc)
    
    # Store session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    session_doc = {
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Delete old sessions for this user
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one(session_doc)
    
    # Set httpOnly cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60  # 7 days
    )
    
    # Get user data to return
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    return {"user": user_doc, "message": "Authenticated successfully"}

@api_router.get("/auth/me")
async def get_me(user: User = Depends(get_current_user)):
    """Get current authenticated user"""
    return user.model_dump()

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

@api_router.post("/tasks", response_model=dict, status_code=201)
async def create_task(task_data: TaskCreate, user: User = Depends(get_current_user)):
    """Create a new task"""
    task_id = f"task_{uuid.uuid4().hex[:12]}"
    
    task_doc = {
        "task_id": task_id,
        "user_id": user.user_id,
        "name": task_data.name,
        "reminder_time": task_data.reminder_time,
        "daily_progress": {},
        "is_deleted": False,
        "deleted_at": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.tasks.insert_one(task_doc)
    
    # Return without _id
    return_doc = await db.tasks.find_one({"task_id": task_id}, {"_id": 0})
    return return_doc

@api_router.get("/tasks")
async def get_tasks(include_deleted: bool = False, user: User = Depends(get_current_user)):
    """Get all tasks for current user"""
    query = {"user_id": user.user_id}
    if not include_deleted:
        query["is_deleted"] = {"$ne": True}
    
    tasks = await db.tasks.find(
        query,
        {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    
    # For each task, get subtasks count and completion info
    for task in tasks:
        subtasks = await db.subtasks.find(
            {"task_id": task["task_id"], "user_id": user.user_id},
            {"_id": 0}
        ).to_list(1000)
        task["subtasks"] = subtasks
        task["subtask_count"] = len(subtasks)
        task["completed_subtasks"] = len([s for s in subtasks if s.get("completed")])
    
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
    # Get all tasks
    tasks = await db.tasks.find(
        {"user_id": user.user_id, "is_deleted": {"$ne": True}},
        {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        "Task Name", "Reminder Time", "Task Created",
        "Subtask Name", "Start Date", "End Date", 
        "Completed", "Completed At", "Notes", "Progress %"
    ])
    
    for task in tasks:
        subtasks = await db.subtasks.find(
            {"task_id": task["task_id"], "user_id": user.user_id},
            {"_id": 0}
        ).to_list(1000)
        
        # Calculate progress
        completed_count = len([s for s in subtasks if s.get("completed")])
        progress = round((completed_count / len(subtasks) * 100), 1) if subtasks else 0
        
        if subtasks:
            for subtask in subtasks:
                writer.writerow([
                    task["name"],
                    task["reminder_time"],
                    task.get("created_at", ""),
                    subtask["name"],
                    subtask["start_date"],
                    subtask["end_date"],
                    "Yes" if subtask.get("completed") else "No",
                    subtask.get("completed_at", ""),
                    subtask.get("notes", ""),
                    f"{progress}%"
                ])
        else:
            # Task with no subtasks
            writer.writerow([
                task["name"],
                task["reminder_time"],
                task.get("created_at", ""),
                "", "", "", "", "", "",
                "0%"
            ])
    
    # Prepare response
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
    
    # Get subtasks
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
    
    # Also delete all subtasks for this task
    await db.subtasks.delete_many({"task_id": task_id})
    
    return {"message": "Task permanently deleted"}

@api_router.put("/tasks/{task_id}/progress")
async def update_daily_progress(
    task_id: str,
    progress: DailyProgressUpdate,
    user: User = Depends(get_current_user)
):
    """Update daily progress for a task"""
    task = await db.tasks.find_one(
        {"task_id": task_id, "user_id": user.user_id},
        {"_id": 0}
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    daily_progress = task.get("daily_progress", {})
    
    if progress.completed:
        daily_progress[progress.date] = {
            "completed": True,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "notes": progress.notes or ""
        }
    else:
        daily_progress[progress.date] = {
            "completed": False,
            "completed_at": None,
            "notes": progress.notes or ""
        }
    
    await db.tasks.update_one(
        {"task_id": task_id},
        {"$set": {"daily_progress": daily_progress}}
    )
    
    updated_task = await db.tasks.find_one({"task_id": task_id}, {"_id": 0})
    return updated_task

# ============== Subtask Endpoints ==============

@api_router.post("/tasks/{task_id}/subtasks", status_code=201)
async def create_subtask(task_id: str, subtask_data: SubtaskCreate, user: User = Depends(get_current_user)):
    """Create a subtask for a task"""
    # Verify task exists and belongs to user
    task = await db.tasks.find_one(
        {"task_id": task_id, "user_id": user.user_id},
        {"_id": 0}
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    subtask_id = f"subtask_{uuid.uuid4().hex[:12]}"
    
    subtask_doc = {
        "subtask_id": subtask_id,
        "task_id": task_id,
        "user_id": user.user_id,
        "name": subtask_data.name,
        "start_date": subtask_data.start_date,
        "end_date": subtask_data.end_date,
        "completed": False,
        "completed_at": None,
        "notes": subtask_data.notes or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.subtasks.insert_one(subtask_doc)
    
    return_doc = await db.subtasks.find_one({"subtask_id": subtask_id}, {"_id": 0})
    return return_doc

@api_router.get("/tasks/{task_id}/subtasks")
async def get_subtasks(task_id: str, user: User = Depends(get_current_user)):
    """Get all subtasks for a task"""
    # Verify task exists and belongs to user
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
    
    # If completing, set completed_at
    if subtask_data.completed is True:
        update_dict["completed_at"] = datetime.now(timezone.utc).isoformat()
    elif subtask_data.completed is False:
        update_dict["completed_at"] = None
    
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    result = await db.subtasks.update_one(
        {"subtask_id": subtask_id, "user_id": user.user_id},
        {"$set": update_dict}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    updated_subtask = await db.subtasks.find_one({"subtask_id": subtask_id}, {"_id": 0})
    return updated_subtask

@api_router.delete("/subtasks/{subtask_id}")
async def delete_subtask(subtask_id: str, user: User = Depends(get_current_user)):
    """Delete a subtask"""
    result = await db.subtasks.delete_one({"subtask_id": subtask_id, "user_id": user.user_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    return {"message": "Subtask deleted successfully"}

# ============== Google Calendar Integration ==============

GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')
GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar", "https://www.googleapis.com/auth/userinfo.email"]

@api_router.get("/calendar/auth/url")
async def get_google_auth_url(request: Request, user: User = Depends(get_current_user)):
    """Get Google OAuth URL for calendar access"""
    # Get the frontend URL from referer or use default
    referer = request.headers.get("referer", "")
    base_url = referer.split("/dashboard")[0] if "/dashboard" in referer else os.environ.get('FRONTEND_URL', 'https://taskflow-tracker-23.preview.emergentagent.com')
    redirect_uri = f"{base_url}/api/calendar/callback"
    
    auth_url = (
        f"https://accounts.google.com/o/oauth2/auth?"
        f"client_id={GOOGLE_CLIENT_ID}&"
        f"redirect_uri={redirect_uri}&"
        f"response_type=code&"
        f"scope={'%20'.join(GOOGLE_SCOPES)}&"
        f"access_type=offline&"
        f"prompt=consent&"
        f"state={user.user_id}"
    )
    
    return {"authorization_url": auth_url, "redirect_uri": redirect_uri}

@api_router.get("/calendar/callback")
async def google_calendar_callback(code: str, state: str, request: Request):
    """Handle Google OAuth callback"""
    # Get redirect URI
    referer = request.headers.get("referer", "")
    base_url = str(request.base_url).rstrip("/")
    # Extract the actual base URL from the request
    host = request.headers.get("host", "")
    scheme = request.headers.get("x-forwarded-proto", "https")
    base_url = f"{scheme}://{host}"
    redirect_uri = f"{base_url}/api/calendar/callback"
    
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
        return RedirectResponse(f"{base_url}/dashboard?calendar_error=token_exchange_failed")
    
    token_data = token_resp.json()
    
    # Get user email from Google
    user_info_resp = requests.get(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        headers={'Authorization': f'Bearer {token_data["access_token"]}'}
    )
    
    if user_info_resp.status_code != 200:
        return RedirectResponse(f"{base_url}/dashboard?calendar_error=user_info_failed")
    
    google_email = user_info_resp.json().get('email')
    
    # Save tokens to user document (state contains user_id)
    user_id = state
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {
            "google_calendar_tokens": token_data,
            "google_calendar_email": google_email,
            "google_calendar_connected_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return RedirectResponse(f"{base_url}/dashboard?calendar_connected=true")

async def get_google_credentials(user_id: str):
    """Get Google credentials for a user, refreshing if needed"""
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    if not user_doc or not user_doc.get("google_calendar_tokens"):
        return None
    
    tokens = user_doc["google_calendar_tokens"]
    
    creds = Credentials(
        token=tokens.get('access_token'),
        refresh_token=tokens.get('refresh_token'),
        token_uri='https://oauth2.googleapis.com/token',
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=GOOGLE_SCOPES
    )
    
    # Refresh if expired
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(GoogleRequest())
            # Update stored tokens
            await db.users.update_one(
                {"user_id": user_id},
                {"$set": {
                    "google_calendar_tokens.access_token": creds.token
                }}
            )
        except Exception as e:
            logger.error(f"Failed to refresh Google token: {e}")
            return None
    
    return creds

@api_router.get("/calendar/status")
async def get_calendar_status(user: User = Depends(get_current_user)):
    """Check if Google Calendar is connected"""
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    
    if not user_doc:
        return {"connected": False}
    
    connected = bool(user_doc.get("google_calendar_tokens"))
    
    return {
        "connected": connected,
        "email": user_doc.get("google_calendar_email") if connected else None,
        "connected_at": user_doc.get("google_calendar_connected_at") if connected else None
    }

@api_router.post("/calendar/disconnect")
async def disconnect_calendar(user: User = Depends(get_current_user)):
    """Disconnect Google Calendar"""
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$unset": {
            "google_calendar_tokens": "",
            "google_calendar_email": "",
            "google_calendar_connected_at": ""
        }}
    )
    
    # Also remove calendar event IDs from subtasks
    await db.subtasks.update_many(
        {"user_id": user.user_id},
        {"$unset": {"calendar_event_id": ""}}
    )
    
    return {"message": "Calendar disconnected"}

@api_router.post("/calendar/sync")
async def sync_to_calendar(user: User = Depends(get_current_user)):
    """Sync all tasks and subtasks to Google Calendar"""
    creds = await get_google_credentials(user.user_id)
    
    if not creds:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")
    
    try:
        service = build('calendar', 'v3', credentials=creds)
        
        # Get all tasks with subtasks
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
                # Create or update calendar event
                event_body = {
                    'summary': f"[{task['name']}] {subtask['name']}",
                    'description': f"Task: {task['name']}\nSubtask: {subtask['name']}\n\n{subtask.get('notes', '')}",
                    'start': {
                        'date': subtask['start_date'],
                    },
                    'end': {
                        'date': subtask['end_date'],
                    },
                    'reminders': {
                        'useDefault': False,
                        'overrides': [
                            {'method': 'popup', 'minutes': 60},
                        ],
                    },
                }
                
                existing_event_id = subtask.get('calendar_event_id')
                
                try:
                    if existing_event_id:
                        # Update existing event
                        service.events().update(
                            calendarId='primary',
                            eventId=existing_event_id,
                            body=event_body
                        ).execute()
                    else:
                        # Create new event
                        event = service.events().insert(
                            calendarId='primary',
                            body=event_body
                        ).execute()
                        
                        # Save event ID to subtask
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

@api_router.get("/calendar/events")
async def get_calendar_events(user: User = Depends(get_current_user)):
    """Get upcoming events from Google Calendar"""
    creds = await get_google_credentials(user.user_id)
    
    if not creds:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")
    
    try:
        service = build('calendar', 'v3', credentials=creds)
        
        now = datetime.now(timezone.utc).isoformat()
        
        events_result = service.events().list(
            calendarId='primary',
            timeMin=now,
            maxResults=50,
            singleEvents=True,
            orderBy='startTime'
        ).execute()
        
        events = events_result.get('items', [])
        
        return {"events": events}
    
    except Exception as e:
        logger.error(f"Failed to get calendar events: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get events: {str(e)}")

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
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
