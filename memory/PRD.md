# TaskFlow - Task Tracker App PRD

## Original Problem Statement
Task tracker app for both mobile and desktop with:
- Left column for all tasks listed
- Right columns for day-wise tracking and subtask progress
- Each task has reminder time and progress percentage
- Click on task opens subtasks in new tab
- Gantt chart style view for subtasks

## User Choices
- Authentication: Emergent Google OAuth
- Notifications: Browser notifications only
- Data Storage: MongoDB
- Theme: Auto (system preference)
- Date Range: Custom range selector (infinite scroll)

## Architecture

### Backend (FastAPI)
- **Auth**: Emergent Google OAuth with session management
- **Models**: User, Task, Subtask, UserSession
- **Endpoints**:
  - `/api/auth/session` - Exchange session_id for session_token
  - `/api/auth/me` - Get current user
  - `/api/auth/logout` - Logout user
  - `/api/tasks` - CRUD for tasks
  - `/api/tasks/{id}/subtasks` - CRUD for subtasks
  - `/api/tasks/export/csv` - Export to CSV
  - `/api/tasks/bin` - Soft delete / restore
  - `/api/calendar/*` - Google Calendar integration

### Frontend (React)
- **Pages**:
  - LandingPage - Hero section with Google login
  - Dashboard - Gantt chart view with subtask bars
  - SubtaskPage - Opens in new tab for subtask management
- **Features**:
  - Infinite scroll date navigation (past & future)
  - Gantt chart bars for subtasks
  - Subtask completion checkbox
  - Browser notifications for reminders
  - Auto theme detection
  - CSV export
  - Google Calendar sync

## What's Been Implemented ✅
- [x] Google OAuth authentication
- [x] Task CRUD operations
- [x] Subtask management with start/end date ranges
- [x] Gantt chart view with colored bars
- [x] Progress % based on subtask completion
- [x] Infinite date scroll (left/right navigation)
- [x] Soft delete (bin) with restore
- [x] Notes for subtasks
- [x] CSV export
- [x] Google Calendar integration
- [x] Browser notifications
- [x] Auto light/dark theme
- [x] Responsive design (mobile & desktop)

## User Personas
1. **Individual Professional** - Tracks personal learning/project tasks
2. **Student** - Tracks coursework and study progress
3. **Project Manager** - Tracks team deliverables (single user mode)

## Core Requirements (Static)
- R1: Gantt chart view for all tasks/subtasks
- R2: Subtask date ranges displayed as bars
- R3: Time-based reminders per task
- R4: Progress percentage from subtask completion
- R5: Subtask breakdown per task
- R6: Google OAuth authentication
- R7: Responsive for mobile and desktop
- R8: CSV export
- R9: Google Calendar sync

## Prioritized Backlog

### P0 (Critical) - DONE ✅
- All core features implemented

### P1 (Important) - Future
- [ ] Email notifications
- [ ] Recurring tasks
- [ ] Task categories/tags

### P2 (Nice to Have)
- [ ] Drag and drop task reordering
- [ ] Task templates
- [ ] Weekly/monthly summary reports
- [ ] Team collaboration features

## Next Tasks
1. Deploy to production
2. Test Google Calendar sync with real account
3. Consider adding task categories/tags
