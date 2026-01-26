# TaskFlow - Task Tracker App PRD

## Original Problem Statement
Task tracker app for both mobile and desktop with:
- Left column for all tasks listed
- Right columns for day-wise tracking and subtask progress
- Each task has reminder time and progress percentage
- Click on task opens subtasks in new tab

## User Choices
- Authentication: Emergent Google OAuth
- Notifications: Browser notifications only
- Data Storage: MongoDB
- Theme: Auto (system preference)
- Date Range: Custom range selector

## Architecture

### Backend (FastAPI)
- **Auth**: Emergent Google OAuth with session management
- **Models**: User, Task, Subtask, UserSession
- **Endpoints**:
  - `/api/auth/session` - Exchange session_id for session_token
  - `/api/auth/me` - Get current user
  - `/api/auth/logout` - Logout user
  - `/api/tasks` - CRUD for tasks
  - `/api/tasks/{id}/progress` - Update daily progress
  - `/api/tasks/{id}/subtasks` - CRUD for subtasks

### Frontend (React)
- **Pages**:
  - LandingPage - Hero section with Google login
  - Dashboard - Main task grid view
  - SubtaskPage - Opens in new tab for subtask management
- **Features**:
  - Date range picker for custom views
  - Inline editing for progress cells
  - Browser notifications for reminders
  - Auto theme detection

## What's Been Implemented ✅
- [x] Google OAuth authentication (Jan 26, 2026)
- [x] Task CRUD operations (Jan 26, 2026)
- [x] Subtask management (Jan 26, 2026)
- [x] Daily progress tracking grid (Jan 26, 2026)
- [x] Custom date range selector (Jan 26, 2026)
- [x] Progress percentage calculation (Jan 26, 2026)
- [x] Browser notifications (Jan 26, 2026)
- [x] Auto light/dark theme (Jan 26, 2026)
- [x] Responsive design (mobile & desktop) (Jan 26, 2026)

## User Personas
1. **Individual Professional** - Tracks personal learning/project tasks
2. **Student** - Tracks coursework and study progress
3. **Project Manager** - Tracks team deliverables (single user mode)

## Core Requirements (Static)
- R1: Single page grid view for all tasks
- R2: Day-wise progress columns
- R3: Time-based reminders per task
- R4: Progress percentage calculation
- R5: Subtask breakdown per task
- R6: Google OAuth authentication
- R7: Responsive for mobile and desktop

## Prioritized Backlog

### P0 (Critical) - DONE ✅
- All core features implemented

### P1 (Important) - Future
- [ ] Export tasks to CSV/PDF
- [ ] Email notifications (optional)
- [ ] Recurring tasks
- [ ] Task categories/tags

### P2 (Nice to Have)
- [ ] Drag and drop task reordering
- [ ] Task templates
- [ ] Weekly/monthly summary reports
- [ ] Team collaboration features

## Next Tasks
1. User testing with real Google OAuth flow
2. Consider adding task categories/tags
3. Add export functionality
