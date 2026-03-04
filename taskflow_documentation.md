# TaskFlow — Comprehensive Technical Documentation

> **Project Type:** Full-Stack Web Application — Gantt-style daily task tracker with Google ecosystem integrations.

---

## 1. Project Overview

**TaskFlow** is a productivity application that lets users create tasks, break them into date-ranged subtasks, and track completion day-by-day in a visual Gantt-chart view. Every account is tied to Google OAuth, enabling calendar sync and Google Drive backup out of the box.

### Core Value Props
| Feature | Description |
|---|---|
| Gantt Grid | Browse tasks across dates with a scrollable, week-navigable grid |
| Day Checkboxes | Mark each subtask as done/not-done per calendar day |
| Per-Day Notes | Attach freetext notes to any individual day of any subtask |
| Reminders | Browser push notifications at a per-task time you configure |
| Google Calendar Sync | Push all subtasks as calendar events (insert or update) |
| Google Drive Backup | Export a full JSON snapshot of all data to Drive |
| CSV Export | Download all task/subtask/day data as a CSV file |
| Recycle Bin | Soft-delete with restore or permanent delete |
| Dark / Light / System Theme | Persisted to `localStorage` |

---

## 2. Repository Structure

```
Taskflow/
├── backend/
│   ├── server.py          # Entire FastAPI backend (894 lines)
│   └── requirements.txt   # Python dependencies (pinned)
├── frontend/
│   ├── src/
│   │   ├── App.js          # Root: Router, ThemeProvider, ProtectedRoute
│   │   ├── pages/
│   │   │   ├── LandingPage.jsx    # Public marketing + login page
│   │   │   ├── Dashboard.jsx      # Gantt chart main view
│   │   │   └── SubtaskPage.jsx    # Detailed subtask management (new tab)
│   │   ├── components/ui/  # shadcn/ui component library (46 files)
│   │   ├── hooks/          # Custom React hooks
│   │   └── lib/            # Utilities (cn helper etc.)
│   ├── package.json        # React 19 + all deps
│   ├── craco.config.js     # CRACO config (path aliases, etc.)
│   ├── tailwind.config.js  # Tailwind v3 config
│   └── components.json     # shadcn/ui config
├── design_guidelines.json  # Brand & design system spec
├── backend_test.py         # Integration test suite
├── backend_test_results.json
├── test_result.md
├── auth_testing.md
└── .gitignore
```

---

## 3. Tech Stack

### Backend
| Layer | Technology |
|---|---|
| Runtime | Python 3.x |
| Web Framework | **FastAPI 0.110.1** |
| ASGI Server | **Uvicorn 0.25.0** |
| Database Driver | **Motor 3.3.1** (async MongoDB) |
| Data Validation | **Pydantic v2** (models & request bodies) |
| Google OAuth | `google-auth`, `google-auth-oauthlib` |
| Google APIs | `google-api-python-client` (Calendar v3, Drive v3) |
| HTTP Client | `httpx`, `requests` |
| Environment | `python-dotenv` |
| CORS | Starlette `CORSMiddleware` |

### Frontend
| Layer | Technology |
|---|---|
| UI Framework | **React 19** |
| Build Tool | **CRACO** (wrapping Create React App) |
| Routing | **React Router DOM v7** |
| Styling | **Tailwind CSS v3** |
| Component Library | **shadcn/ui** (Radix UI primitives) |
| Animations | **Framer Motion 12** |
| Date Utilities | **date-fns v4** |
| Icons | **Lucide React** |
| Charts | **Recharts 3** |
| Notifications | **Sonner** (toast) |
| HTTP | Native `fetch` with `credentials: "include"` |

### Database
| Aspect | Detail |
|---|---|
| Engine | **MongoDB** (accessed via Motor async driver) |
| Collections | `users`, `user_sessions`, [tasks](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/backend/server.py#353-385), [subtasks](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/backend/server.py#569-586) |
| Connection | `MONGO_URL` env var; async motor client |

### External Services
| Service | Purpose |
|---|---|
| **Google OAuth 2.0** | Authentication / sign-in |
| **Google Calendar API v3** | Sync subtasks as calendar events |
| **Google Drive API v3** | JSON backup files per user |

---

## 4. System Architecture

```
┌──────────────── Browser ──────────────────┐
│  React SPA (CRA + CRACO)                  │
│  ┌─────────────┐  ┌───────────────────┐   │
│  │ LandingPage │  │ Dashboard (Gantt) │   │
│  └──────┬──────┘  └────────┬──────────┘   │
│         │                  │ fetch() + credentials:include
└─────────┼──────────────────┼──────────────┘
          │                  │
          ▼                  ▼
┌─────────────────────────────────────┐
│  FastAPI Backend  (server.py)       │
│  ┌─────────┐ ┌────────┐ ┌────────┐ │
│  │ /auth   │ │ /tasks │ │/drive  │ │
│  │ /api    │ │/subtasks│ │/calendar││
│  └────┬────┘ └───┬────┘ └───┬────┘ │
└───────┼──────────┼──────────┼──────┘
        │          │          │
        ▼          ▼          ▼
   ┌─────────┐ ┌───────┐ ┌──────────────────┐
   │ MongoDB  │ │MongoDB│ │ Google APIs       │
   │(sessions)│ │(tasks)│ │ (Calendar, Drive) │
   └─────────┘ └───────┘ └──────────────────┘
        ▲
        │ OAuth 2.0 flow
   ┌────────────────┐
   │ accounts.google│
   │    .com        │
   └────────────────┘
```

### Communication Pattern
- Frontend → Backend: all calls use `REACT_APP_BACKEND_URL/api`, with `credentials: "include"` so the `session_token` HTTP-only cookie is sent automatically.
- Backend routes are all prefixed `/api` via `APIRouter`.
- Google OAuth: a 3-legged OAuth 2.0 Authorization Code flow. The backend exchanges codes for tokens and stores them in MongoDB.

---

## 5. Authentication & Session Flow

```
User clicks "Continue with Google"
        │
        ▼
GET /api/auth/google/url  (backend returns authorization_url)
        │
        ▼
Browser redirects → accounts.google.com/o/oauth2/auth
 (scopes: userinfo.email, userinfo.profile, calendar, drive.file)
        │
        ▼
Google redirects → GET /api/auth/google/callback?code=...
        │
        ▼
Backend exchanges code → access_token + refresh_token
 stores google_tokens into db.users
 creates session: db.user_sessions  (7-day TTL)
        │
        ▼
Response: HTTP 302 → /dashboard
 Set-Cookie: session_token=sess_xxx; HttpOnly; Secure; SameSite=None
        │
        ▼
All subsequent API calls include this cookie
Backend: get_current_user()  validates cookie → session → user
```

### Session Security Details
| Property | Value |
|---|---|
| Token format | `sess_` + `uuid4().hex` |
| Lifetime | 7 days |
| Cookie flags | `HttpOnly`, `Secure`, `SameSite=None` |
| Storage | MongoDB `user_sessions` collection |
| Token exposure | Google tokens are **never** returned to the client |
| Token refresh | Auto-refreshed if expired and `refresh_token` is present |

---

## 6. Data Models

### `users` collection
```json
{
  "user_id": "user_<12-char hex>",
  "email": "user@example.com",
  "name": "Full Name",
  "picture": "https://...",
  "google_tokens": { "access_token": "...", "refresh_token": "..." },
  "drive_folder_id": "<Google Drive folder ID>",
  "created_at": "2024-01-01T00:00:00Z"
}
```

### `user_sessions` collection
```json
{
  "user_id": "user_<12-char hex>",
  "session_token": "sess_<hex>",
  "expires_at": "2024-01-08T00:00:00Z",
  "created_at": "2024-01-01T00:00:00Z"
}
```

### [tasks](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/backend/server.py#353-385) collection
```json
{
  "task_id": "task_<12-char hex>",
  "user_id": "user_<12-char hex>",
  "name": "Exercise Daily",
  "reminder_time": "07:30",
  "is_deleted": false,
  "deleted_at": null,
  "created_at": "2024-01-01T00:00:00Z"
}
```

### [subtasks](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/backend/server.py#569-586) collection
```json
{
  "subtask_id": "subtask_<12-char hex>",
  "task_id": "task_<12-char hex>",
  "user_id": "user_<12-char hex>",
  "name": "Morning Run",
  "start_date": "2024-01-01",
  "end_date": "2024-01-31",
  "notes": "...",
  "calendar_event_id": "<Google Calendar event ID or null>",
  "day_completions": {
    "2024-01-01": { "completed": true, "notes": "Did 5km", "completed_at": "2024-01-01T07:45:00Z" },
    "2024-01-02": { "completed": false, "notes": "", "completed_at": null }
  },
  "created_at": "2024-01-01T00:00:00Z"
}
```

> **Key design:** `day_completions` is a map of `YYYY-MM-DD → { completed, notes, completed_at }`. It is pre-populated for every day in the date range when the subtask is created, and dynamically adjusted if dates are edited.

---

## 7. API Reference

All routes require authentication (session cookie) unless marked **Public**.

### Auth
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/auth/google/url` | **Public** — Returns Google OAuth redirect URL |
| GET | `/api/auth/google/callback` | **Public** — OAuth callback, sets session cookie |
| GET | `/api/auth/me` | Returns current user profile (no tokens) |
| POST | `/api/auth/logout` | Deletes session, clears cookie |

### Tasks
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/tasks` | Create task |
| GET | `/api/tasks` | List all active tasks (with subtasks & progress) |
| GET | `/api/tasks/bin` | List soft-deleted tasks |
| GET | `/api/tasks/export/csv` | Download full CSV export |
| GET | `/api/tasks/{id}` | Get single task with subtasks |
| PUT | `/api/tasks/{id}` | Update task name or reminder_time |
| DELETE | `/api/tasks/{id}` | Soft delete (move to bin) |
| POST | `/api/tasks/{id}/restore` | Restore from bin |
| DELETE | `/api/tasks/{id}/permanent` | Permanently delete task + subtasks |

### Subtasks
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/tasks/{task_id}/subtasks` | Create subtask with date range |
| GET | `/api/tasks/{task_id}/subtasks` | List subtasks for a task |
| PUT | `/api/subtasks/{id}` | Update subtask (name/dates, preserves completions) |
| PUT | `/api/subtasks/{id}/day/{date}` | Toggle day completion + notes |
| DELETE | `/api/subtasks/{id}` | Delete subtask |

### Google Integrations
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/calendar/status` | Check if Google is connected |
| POST | `/api/calendar/sync` | Sync all subtasks → Google Calendar events |
| POST | `/api/drive/backup` | Upload JSON backup to Google Drive |
| GET | `/api/drive/backups` | List backup files in Drive |

### Utility
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/` | Health check |
| GET | `/api/health` | Returns status + timestamp |

---

## 8. Frontend Architecture

### Routing ([App.js](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/frontend/src/App.js))
```
/                → LandingPage    (public)
/dashboard       → Dashboard      (ProtectedRoute)
/task/:taskId    → SubtaskPage    (ProtectedRoute, opens in new tab)
```

**[ProtectedRoute](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/frontend/src/App.js#57-101)** checks `GET /api/auth/me` on mount. If unauthenticated, instantly redirects to `/`. On success, passes `{ user, setUser }` as render props to the child component.

### State Management
No external state library (no Redux/Zustand). Each page manages its own local state with `useState` + `useCallback`. The only shared global state is the **theme** (Light/Dark/System), provided via a React Context (`ThemeContext`) in [App.js](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/frontend/src/App.js).

### Pages
| Page | File | Key Features |
|---|---|---|
| **Landing** | [LandingPage.jsx](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/frontend/src/pages/LandingPage.jsx) | Auth check on load, redirect if already logged in, Google login flow, feature grid |
| **Dashboard** | [Dashboard.jsx](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/frontend/src/pages/Dashboard.jsx) | Gantt grid with scrollable date columns, inline task edit, bin dialog, CSV export, calendar sync, Drive backup, reminders |
| **Subtask** | [SubtaskPage.jsx](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/frontend/src/pages/SubtaskPage.jsx) | 7-column day grid per subtask, day-level checkboxes + notes dialog, progress bar, date picker (Popover+Calendar), inline edit |

### Theme System
Stored in `localStorage` key `taskflow-theme`. A `useEffect` watches the value and adds/removes the `dark` class on `document.documentElement`. When set to `system`, it listens to `window.matchMedia("(prefers-color-scheme: dark)")` and responds to OS changes automatically.

---

## 9. Features — Deep Dive

### Gantt View (Dashboard)
- Renders a two-panel layout: **fixed left panel** (task name, bell icon, progress %, actions) and a **horizontally-scrollable right panel** (date columns at 40px each).
- Default window: 14 days before today → 28 days after (42 days total).
- Navigation: `ChevronLeft`/`ChevronRight` shift the window by 7 days. "Today" button resets to default.
- **Color coding in cells:**
  - Blue tint (`bg-accent/5`): today's column
  - Blue tint (`bg-accent/5`): future dates within range
  - Green (`bg-success/10`): completed day
  - Red (`bg-destructive/10`): past date, not completed (overdue)

### Reminder System
- On Dashboard mount, `Notification.requestPermission()` is called.
- A `setInterval` runs every 60 seconds, comparing `task.reminder_time` (HH:MM) to the current time `format(new Date(), "HH:mm")`.
- On match: sends a native browser notification **and** a Sonner toast (10-second duration).

### Google Calendar Sync
- For each active task's subtasks, a `calendar.events.insert()` or `calendar.events.update()` call is made.
- Event `calendar_event_id` is persisted in the subtask document after first sync, enabling subsequent updates (not duplicates).
- Sync failure for one subtask doesn't abort others.

### Google Drive Backup
- Creates a `TaskFlow Backup` folder in the user's Drive on first login.
- Each backup is a JSON file: `taskflow_backup_YYYYMMDD_HHmmss.json`, uploaded with the user's full task + subtask tree.
- Returns a `webViewLink` so users can open it directly.

### CSV Export
- `StreamingResponse` from the backend; the frontend creates a Blob URL and programmatically clicks an anchor to download.
- Columns: `Task Name, Reminder Time, Subtask Name, Start Date, End Date, Date, Completed, Notes`.
- One row per calendar day of each subtask.

---

## 10. Security

| Concern | Implementation |
|---|---|
| Authentication | Google OAuth 2.0 (no passwords stored) |
| Session Token | `HttpOnly` cookie — inaccessible to JavaScript |
| Secure transport | Cookie `Secure=true`, `SameSite=None` |
| Session expiry | 7-day TTL, checked on every request |
| Token isolation | `google_tokens` field stripped from `/auth/me` response |
| Token refresh | Automatic rotation when access token is expired |
| Data isolation | Every DB query filters by `user_id` — users can only see their own data |
| CORS | Configurable via `CORS_ORIGINS` env var; `allow_credentials=True` |
| Input validation | All request bodies validated by Pydantic v2 models |
| Date range validation | `PUT /subtasks/{id}/day/{date}` verifies date is within `[start_date, end_date]` |
| Soft deletes | Tasks are soft-deleted first; permanent delete requires a second explicit call |

> [!WARNING]
> The [.gitignore](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/.gitignore) excludes `*.env` and `*credentials.json*`, but a `client_secret_796157686826-...json` file is visible at the repo root. This file should be revoked and removed from history before any public sharing.

---

## 11. Design System

Defined in [design_guidelines.json](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/design_guidelines.json).

| Aspect | Spec |
|---|---|
| Archetype | Swiss & High-Contrast |
| Tone | Functional, Precise, Kinetic |
| Heading font | **Manrope** (sans-serif) |
| Body font | **IBM Plex Sans** |
| Mono font | **JetBrains Mono** |
| Icon library | **Lucide React** |
| Animation library | **Framer Motion** (0.2s easeOut) |
| Border radius | Cards: `rounded-sm`; Buttons: `rounded-md` |
| Color rule | No decorative gradients — color is for **status only** |
| Notifications | Sonner toast library only |

### Color Palette
| Token | Light | Dark |
|---|---|---|
| Background | `#FFFFFF` | `#020617` |
| Primary | `#0F172A` | `#F8FAFC` |
| Surface / Card | `#F1F5F9` | `#1E293B` |
| Accent (Action) | `#007AFF` | `#007AFF` |
| Success | `#22C55E` | — |
| Warning | `#F59E0B` | — |
| Error / Destructive | `#EF4444` | — |

---

## 12. Environment Variables

### Backend (`.env` in `backend/`)
| Variable | Description |
|---|---|
| `MONGO_URL` | MongoDB connection string |
| `DB_NAME` | MongoDB database name |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console OAuth 2.0 credentials |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console OAuth 2.0 credentials |
| `CORS_ORIGINS` | Comma-separated allowed origins (defaults to `*`) |

### Frontend
| Variable | Description |
|---|---|
| `REACT_APP_BACKEND_URL` | Base URL of the FastAPI server (e.g. `http://localhost:8001`) |

---

## 13. Running Locally

### Backend
```bash
cd backend
pip install -r requirements.txt
# Create .env with MONGO_URL, DB_NAME, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
uvicorn server:app --reload --port 8001
```

### Frontend
```bash
cd frontend
yarn install
# Set REACT_APP_BACKEND_URL=http://localhost:8001 in .env
yarn start      # runs via CRACO on port 3000
```

---

## 14. Testing

| File | Description |
|---|---|
| [backend_test.py](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/backend_test.py) | Integration tests covering auth flow, task CRUD, subtask CRUD, day completion, CSV export, Calendar/Drive endpoints |
| [backend_test_results.json](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/backend_test_results.json) | Last test run machine-readable output |
| [test_result.md](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/test_result.md) | Human-readable test summary |
| [auth_testing.md](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/auth_testing.md) | Manual auth-flow testing notes |

---

## 15. Key Design Decisions

| Decision | Rationale |
|---|---|
| Single [server.py](file:///c:/Users/91944/Downloads/3.Projects%20Portfolio/Projects/Taskflow/backend/server.py) file | Simple monolithic layout for a project of this scope; all domain logic in one place |
| Motor (async MongoDB) | FastAPI is async-native; Motor avoids blocking the event loop |
| Custom session tokens | Avoids JWT complexity; session data stored server-side for easy revocation |
| `day_completions` as embedded map | Keeps all data for a subtask in one document; no join required |
| SubtaskPage opens in new tab | Allows side-by-side Gantt + detail view without losing dashboard context |
| CRACO instead of Next.js | Avoids server-side rendering overhead for a client-only SPA that relies on cookie auth |
| shadcn/ui (Radix primitives) | Accessible, headless components fully customizable with Tailwind |
