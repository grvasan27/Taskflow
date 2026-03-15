import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme, getAuthHeaders } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Plus,
  Calendar as CalendarIcon,
  Bell,
  LogOut,
  Trash2,
  ExternalLink,
  CheckCircle2,
  RotateCcw,
  Archive,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  MessageSquare,
  Download,
  RefreshCw,
  HardDrive,
  DownloadCloud,
  Edit2,
  Check,
  X,
  Sun,
  Moon,
  Monitor,
  ZoomIn,
  ZoomOut,
  GripVertical,
  Settings,
  Target,
  ShieldAlert
} from "lucide-react";
import { format, addDays, parseISO, isToday, startOfDay, isBefore } from "date-fns";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Dashboard = ({ user, setUser }) => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(addDays(startOfDay(new Date()), -14));
  const [daysToShow, setDaysToShow] = useState(42);
  const [cellWidth, setCellWidth] = useState(40);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ name: "", reminder_time: "09:00" });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showBin, setShowBin] = useState(false);
  const [deletedTasks, setDeletedTasks] = useState([]);
  const [notesDialog, setNotesDialog] = useState(null);
  const [notesText, setNotesText] = useState("");
  const [calendarStatus, setCalendarStatus] = useState({ connected: false });
  const [syncing, setSyncing] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoringFromDrive, setRestoringFromDrive] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [editTaskName, setEditTaskName] = useState("");
  const [editTaskReminder, setEditTaskReminder] = useState("");
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [taskSubtasksMap, setTaskSubtasksMap] = useState({});
  const [newSubtask, setNewSubtask] = useState({ name: "", start_date: format(new Date(), "yyyy-MM-dd"), end_date: format(addDays(new Date(), 7), "yyyy-MM-dd"), date_mode: "range", custom_dates: [], time_slot: "" });
  const [editingSlot, setEditingSlot] = useState(null); // { subtaskId, value }
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [editingSubtask, setEditingSubtask] = useState(null); // { subtask_id, name, start_date, end_date }
  const [dayComment, setDayComment] = useState({ subtaskId: null, date: null, text: "", completedAt: "", open: false });
  const [sortMode, setSortMode] = useState(localStorage.getItem("taskflow_sort") || "manual");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminSettings, setAdminSettings] = useState({ max_users: 1000 });
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);
  const scrollContainerRef = useRef(null);
  const notificationIntervalRef = useRef(null);

  // Sync expansion panel height between left/right halves
  const expandedPanelRef = useRef(null);
  const [expandedPanelHeight, setExpandedPanelHeight] = useState(0);

  useEffect(() => {
    if (!expandedPanelRef.current) return;
    const observer = new ResizeObserver(entries => {
      setExpandedPanelHeight(entries[0].target.offsetHeight);
    });
    observer.observe(expandedPanelRef.current);
    return () => observer.disconnect();
  }, [expandedTaskId, taskSubtasksMap, editingSubtask, newSubtask]);

  // Time slot validation: must be "HH:MM-HH:MM" with valid 24h times and end > start
  const validateTimeSlot = (value) => {
    if (!value || value.trim() === "") return true; // empty is OK (means no slot set)
    const match = value.match(/^([01]?\d|2[0-3]):([0-5]\d)-([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!match) return false;
    const [, h1, m1, h2, m2] = match;
    const start = parseInt(h1) * 60 + parseInt(m1);
    const end = parseInt(h2) * 60 + parseInt(m2);
    return end > start;
  };

  // Auto-mask input: digits only, auto-inserts : and - → 09151030 → 09:15-10:30
  const formatTimeSlotInput = (raw) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    if (digits.length === 0) return "";
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
    if (digits.length <= 6) return `${digits.slice(0, 2)}:${digits.slice(2, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 2)}:${digits.slice(2, 4)}-${digits.slice(4, 6)}:${digits.slice(6, 8)}`;
  };

  // Admin functions
  const fetchAdminData = useCallback(async () => {
    if (!user?.is_admin) return;
    setIsLoadingAdmin(true);
    try {
      const authHeaders = getAuthHeaders();
      console.log("Fetching admin data with headers:", authHeaders);

      const [usersRes, settingsRes] = await Promise.all([
        fetch(`${API}/admin/users`, { headers: authHeaders, credentials: "include" }),
        fetch(`${API}/admin/settings`, { headers: authHeaders, credentials: "include" })
      ]);

      if (!usersRes.ok || !settingsRes.ok) {
        console.error("Admin fetch failed:", {
          users: { status: usersRes.status, text: usersRes.statusText },
          settings: { status: settingsRes.status, text: settingsRes.statusText }
        });
        if (usersRes.status === 401 || settingsRes.status === 401) {
          toast.error("Session expired. Please log out and back in.");
        } else {
          toast.error(`Admin data load failed (${usersRes.status})`);
        }
        return;
      }

      setAdminUsers(await usersRes.json());
      setAdminSettings(await settingsRes.json());
    } catch (err) {
      console.error("Connection error in fetchAdminData:", err);
      // Log the full error object details if possible
      if (err.name) console.error("Error Name:", err.name);
      if (err.message) console.error("Error Message:", err.message);
      toast.error(`Failed to connect to admin API: ${err.message || 'Unknown error'}`);
    } finally {
      setIsLoadingAdmin(false);
    }
  }, [user]);

  const handleApproveUser = async (userId) => {
    try {
      const res = await fetch(`${API}/admin/users/${userId}/approve`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include"
      });
      if (res.ok) {
        toast.success("User approved");
        fetchAdminData();
      }
    } catch (err) {
      toast.error("Failed to approve user");
    }
  };

  const handleToggleAdmin = async (userId) => {
    try {
      const res = await fetch(`${API}/admin/users/${userId}/toggle-admin`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include"
      });
      if (res.ok) {
        toast.success("Admin status updated");
        fetchAdminData();
      }
    } catch (err) {
      toast.error("Failed to update admin status");
    }
  };

  const handleUpdateAdminSettings = async () => {
    try {
      const res = await fetch(`${API}/admin/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        credentials: "include",
        body: JSON.stringify(adminSettings)
      });
      if (res.ok) {
        toast.success("Settings updated");
      }
    } catch (err) {
      toast.error("Failed to update settings");
    }
  };

  const handleTestEmail = async () => {
    try {
      const res = await fetch(`${API}/admin/test-email`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include"
      });
      if (res.ok) {
        toast.success("Test email sent! Check your inbox.");
      } else {
        const error = await res.json();
        toast.error(error.detail || "Failed to send test email");
      }
    } catch (err) {
      toast.error("Connection error while sending test email");
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Are you sure you want to PERMANENTLY delete this user and all their data? This cannot be undone.")) return;
    try {
      const res = await fetch(`${API}/admin/users/${userId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include"
      });
      if (res.ok) {
        toast.success("User deleted successfully");
        fetchAdminData();
      } else {
        const error = await res.json();
        toast.error(error.detail || "Failed to delete user");
      }
    } catch (err) {
      toast.error("Connection error while deleting user");
    }
  };

  // Generate date columns
  const dateColumns = [];
  for (let i = 0; i < daysToShow; i++) {
    dateColumns.push(addDays(startDate, i));
  }

  const scrollLeft = () => setStartDate(prev => addDays(prev, -7));
  const scrollRight = () => setStartDate(prev => addDays(prev, 7));
  const goToToday = () => setStartDate(addDays(startOfDay(new Date()), -14));

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    try {
      const response = await fetch(`${API}/tasks`, {
        headers: getAuthHeaders(),
        credentials: "include"
      });
      if (!response.ok) {
        if (response.status === 401) {
          navigate("/", { replace: true });
          return;
        }
        throw new Error("Failed to fetch tasks");
      }
      const data = await response.json();
      setTasks(data);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const fetchDeletedTasks = useCallback(async () => {
    try {
      const response = await fetch(`${API}/tasks/bin`, {
        headers: getAuthHeaders(),
        credentials: "include"
      });
      if (response.ok) {
        const data = await response.json();
        setDeletedTasks(data);
      }
    } catch (error) {
      console.error("Error fetching deleted tasks:", error);
    }
  }, []);

  const fetchCalendarStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API}/calendar/status`, {
        headers: getAuthHeaders(),
        credentials: "include"
      });
      if (response.ok) {
        const data = await response.json();
        setCalendarStatus(data);
      }
    } catch (error) {
      console.error("Error fetching calendar status:", error);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchDeletedTasks();
    fetchCalendarStatus();
  }, [fetchTasks, fetchDeletedTasks, fetchCalendarStatus]);

  // Notifications
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const currentTime = format(now, "HH:mm");
      tasks.forEach((task) => {
        if (task.reminder_time === currentTime) {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(`TaskFlow Reminder`, { body: `Time to work on: ${task.name}` });
          }
          toast.info(`Reminder: ${task.name}`, { duration: 10000 });
        }
      });
    };
    notificationIntervalRef.current = setInterval(checkReminders, 60000);
    checkReminders();
    return () => clearInterval(notificationIntervalRef.current);
  }, [tasks]);

  // Task CRUD
  const handleAddTask = async () => {
    if (!newTask.name.trim()) {
      toast.error("Please enter a task name");
      return;
    }
    try {
      const response = await fetch(`${API}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        credentials: "include",
        body: JSON.stringify(newTask),
      });
      if (!response.ok) throw new Error("Failed to create task");
      await fetchTasks();
      setNewTask({ name: "", reminder_time: "09:00" });
      setShowAddTask(false);
      toast.success("Task created successfully");
    } catch (error) {
      toast.error("Failed to create task");
    }
  };

  const handleUpdateTask = async (taskId) => {
    try {
      const updates = {};
      if (editTaskName.trim()) updates.name = editTaskName;
      if (editTaskReminder) updates.reminder_time = editTaskReminder;
      if (Object.keys(updates).length === 0) {
        setEditingTask(null);
        return;
      }
      const response = await fetch(`${API}/tasks/${taskId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error("Failed to update task");
      await fetchTasks();
      setEditingTask(null);
      setEditTaskName("");
      setEditTaskReminder("");
      toast.success("Task updated");
    } catch (error) {
      toast.error("Failed to update task");
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await fetch(`${API}/tasks/${taskId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include"
      });
      await fetchTasks();
      await fetchDeletedTasks();
      setDeleteConfirm(null);
      toast.success("Task moved to bin");
    } catch (error) {
      toast.error("Failed to delete task");
    }
  };

  const handleRestoreTask = async (taskId) => {
    try {
      await fetch(`${API}/tasks/${taskId}/restore`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include"
      });
      await fetchTasks();
      await fetchDeletedTasks();
      toast.success("Task restored");
    } catch (error) {
      toast.error("Failed to restore task");
    }
  };

  const handlePermanentDelete = async (taskId) => {
    try {
      await fetch(`${API}/tasks/${taskId}/permanent`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include"
      });
      await fetchDeletedTasks();
      toast.success("Task permanently deleted");
    } catch (error) {
      toast.error("Failed to delete task");
    }
  };

  // Day completion toggle
  const handleToggleDayCompletion = async (subtask, date, currentStatus) => {
    try {
      let newStatus = "completed";
      if (currentStatus === "completed") newStatus = "failed";
      else if (currentStatus === "failed") newStatus = "empty";

      const completed = newStatus === "completed";
      const cur = subtask.day_completions?.[date] || {};

      const response = await fetch(`${API}/subtasks/${subtask.subtask_id}/day/${date}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        credentials: "include",
        body: JSON.stringify({
          date,
          completed,
          status: newStatus,
          notes: cur.notes || "",
          time_slot: cur.time_slot || undefined
        }),
      });
      if (!response.ok) throw new Error("Failed to update");
      await fetchTasks();
    } catch (error) {
      toast.error("Failed to update completion");
    }
  };

  // Export CSV
  const handleExportCSV = async () => {
    try {
      const response = await fetch(`${API}/tasks/export/csv`, {
        headers: getAuthHeaders(),
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to export");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `taskflow_export_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("CSV exported successfully");
    } catch (error) {
      toast.error("Failed to export CSV");
    }
  };

  // Calendar sync
  const handleSyncCalendar = async () => {
    setSyncing(true);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const response = await fetch(`${API}/calendar/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        credentials: "include",
        body: JSON.stringify({ timezone })
      });
      if (!response.ok) throw new Error("Failed to sync");
      const data = await response.json();
      toast.success(data.message);
    } catch (error) {
      toast.error("Failed to sync to calendar");
    } finally {
      setSyncing(false);
    }
  };

  // Drive backup
  const handleBackupToDrive = async () => {
    setBackingUp(true);
    try {
      const response = await fetch(`${API}/drive/backup`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to backup");
      const data = await response.json();
      toast.success(data.message);
    } catch (error) {
      toast.error("Failed to backup to Drive");
    } finally {
      setBackingUp(false);
    }
  };

  // Drive restore
  const handleRestoreFromDrive = async () => {
    if (!window.confirm("Are you sure? This will replace all your current tasks with the backup from Google Drive.")) {
      return;
    }
    setRestoringFromDrive(true);
    try {
      const response = await fetch(`${API}/drive/restore`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to restore");
      const data = await response.json();
      toast.success(data.message);
      await fetchTasks();
    } catch (error) {
      toast.error("Failed to restore from Drive");
    } finally {
      setRestoringFromDrive(false);
    }
  };

  // Reorder Tasks
  const handleDragEnd = async (result) => {
    if (!result.destination) return;

    const items = Array.from(tasks);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setTasks(items);

    try {
      const taskIds = items.map(t => t.task_id);
      await fetch(`${API}/tasks/reorder`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        credentials: "include",
        body: JSON.stringify({ task_ids: taskIds }),
      });
    } catch (error) {
      toast.error("Failed to save new task order");
      fetchTasks(); // revert on failure
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        headers: getAuthHeaders(),
        credentials: "include"
      });
      // Clear local session token
      localStorage.removeItem('taskflow_session');
      setUser(null);
      navigate("/");
    } catch (error) {
      toast.error("Failed to logout");
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    try {
      await fetch(`${API}/auth/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        credentials: "include",
        body: JSON.stringify({
          auto_backup_enabled: user.auto_backup_enabled || false,
          auto_backup_time: user.auto_backup_time || "00:00",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          email_reminders_enabled: user.email_reminders_enabled || false,
          email_reminder_time: user.email_reminder_time || "08:00"
        }),
      });
      toast.success("Settings saved");
      setSettingsOpen(false);
    } catch (error) {
      toast.error("Failed to save settings");
    }
  };

  const fetchSubtasks = useCallback(async (taskId) => {
    try {
      const res = await fetch(`${API}/tasks/${taskId}/subtasks`, {
        headers: getAuthHeaders(),
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        setTaskSubtasksMap(prev => ({ ...prev, [taskId]: data }));
      }
    } catch (e) { console.error(e); }
  }, []);

  const handleExpandTask = (taskId) => {
    const next = expandedTaskId === taskId ? null : taskId;
    setExpandedTaskId(next);
    if (next) fetchSubtasks(next);
  };

  const handleAddSubtask = async (taskId) => {
    if (!newSubtask.name.trim()) { toast.error("Enter a subtask name"); return; }
    setAddingSubtask(true);
    try {
      const payload = { ...newSubtask };
      if (payload.date_mode !== "custom") payload.custom_dates = [];
      const res = await fetch(`${API}/tasks/${taskId}/subtasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      toast.success("Subtask added");
      setNewSubtask({ name: "", start_date: format(new Date(), "yyyy-MM-dd"), end_date: format(addDays(new Date(), 7), "yyyy-MM-dd"), date_mode: "range", custom_dates: [], time_slot: "" });
      await fetchSubtasks(taskId);
      await fetchTasks();
    } catch { toast.error("Failed to add subtask"); }
    finally { setAddingSubtask(false); }
  };

  const handleDeleteSubtask = async (subtaskId, taskId) => {
    try {
      await fetch(`${API}/subtasks/${subtaskId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        credentials: "include"
      });
      toast.success("Subtask deleted");
      await fetchSubtasks(taskId);
      await fetchTasks();
    } catch { toast.error("Failed to delete subtask"); }
  };

  const handleSaveComment = async () => {
    const { subtaskId, date, text, completedAt } = dayComment;
    if (!subtaskId || !date) return;
    try {
      const existing = tasks.flatMap(t => t.subtasks || []).find(s => s.subtask_id === subtaskId)
        || Object.values(taskSubtasksMap).flat().find(s => s.subtask_id === subtaskId);
      const cur = existing?.day_completions?.[date] || {};
      const completed = cur.completed || false;
      const timeSlot = cur.time_slot || "";
      const payloadCompletedAt = completedAt ? new Date(completedAt).toISOString() : undefined;

      await fetch(`${API}/subtasks/${subtaskId}/day/${date}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        credentials: "include",
        body: JSON.stringify({ date, completed, notes: text, time_slot: timeSlot, completed_at: payloadCompletedAt }),
      });
      await fetchTasks();
      if (expandedTaskId) await fetchSubtasks(expandedTaskId);
    } catch { toast.error("Failed to save comment"); }
  };

  const toggleCustomDate = (dateStr) => {
    setNewSubtask(prev => {
      const dates = prev.custom_dates || [];
      return { ...prev, custom_dates: dates.includes(dateStr) ? dates.filter(d => d !== dateStr) : [...dates, dateStr] };
    });
  };

  const handleUpdateSubtask = async (taskId) => {
    if (!editingSubtask || !editingSubtask.name.trim()) { toast.error("Name required"); return; }
    try {
      const res = await fetch(`${API}/subtasks/${editingSubtask.subtask_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        credentials: "include",
        body: JSON.stringify({ name: editingSubtask.name, start_date: editingSubtask.start_date, end_date: editingSubtask.end_date }),
      });
      if (!res.ok) throw new Error();
      toast.success("Subtask updated");
      setEditingSubtask(null);
      await fetchSubtasks(taskId);
      await fetchTasks();
    } catch { toast.error("Failed to update subtask"); }
  };

  const openSubtaskPage = (taskId) => handleExpandTask(taskId);

  // Calculate progress
  const calculateProgress = (task) => {
    const totalDays = task.total_days || 0;
    const completedDays = task.completed_days || 0;
    return totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;
  };

  // Check if date is in subtask range (respects date_mode)
  const isDateInSubtaskRange = (subtask, dateStr) => {
    const mode = subtask.date_mode || "range";
    if (mode === "custom") {
      return (subtask.custom_dates || []).includes(dateStr);
    }
    if (dateStr < subtask.start_date || dateStr > subtask.end_date) return false;
    if (mode === "alternate") {
      const start = parseISO(subtask.start_date);
      const current = parseISO(dateStr);
      const diffDays = Math.round((current - start) / (1000 * 60 * 60 * 24));
      return diffDays % 2 === 0;
    }
    return true; // range mode
  };

  // Check if day is completed
  const isDayCompleted = (subtask, dateStr) => {
    return subtask.day_completions?.[dateStr]?.completed || false;
  };

  // Check if overdue
  const isOverdue = (subtask, dateStr) => {
    if (isDayCompleted(subtask, dateStr)) return false;
    return isBefore(parseISO(dateStr), startOfDay(new Date()));
  };

  const toggleSort = (type) => {
    let newMode = "manual";
    if (sortMode.startsWith(type)) {
      if (sortMode.endsWith("desc")) newMode = `${type}_asc`;
      else newMode = "manual";
    } else {
      newMode = `${type}_desc`;
    }
    setSortMode(newMode);
    localStorage.setItem("taskflow_sort", newMode);
  };

  const sortedTasks = useMemo(() => {
    if (sortMode === "manual") return tasks;
    return [...tasks].sort((a, b) => {
      if (sortMode.startsWith("created")) {
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return sortMode.endsWith("asc") ? timeA - timeB : timeB - timeA;
      }
      if (sortMode.startsWith("progress")) {
        const progA = calculateProgress(a);
        const progB = calculateProgress(b);
        return sortMode.endsWith("asc") ? progA - progB : progB - progA;
      }
      return 0;
    });
  }, [tasks, sortMode]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user?.is_approved && !user?.is_admin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6 animate-in fade-in zoom-in duration-500">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-2">
            <Bell className="w-10 h-10 text-primary animate-pulse" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight font-['Manrope']">Access Pending</h1>
          <p className="text-muted-foreground text-lg">
            Hi <strong>{user?.name}</strong>, your account is currently awaiting approval from a Taskflow administrator.
          </p>
          <div className="bg-accent/30 p-4 rounded-lg text-sm border border-accent/50">
            <p>We restrict signups to ensure platform stability during our early release phase. You'll be able to access your dashboard as soon as you're approved!</p>
          </div>
          <Button variant="outline" onClick={handleLogout} className="mt-4">
            <LogOut className="w-4 h-4 mr-2" /> Sign Out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="dashboard-container min-h-screen bg-background" data-testid="dashboard">
        {/* Header */}
        <header className="border-b border-border bg-card sticky top-0 z-20">
          <div className="container mx-auto px-4 md:px-8 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-7 w-7 text-accent" />
                <h1 className="text-xl font-bold tracking-tight font-['Manrope']">TaskFlow</h1>
              </div>

              <div className="flex items-center gap-2">
                {/* Navigation */}
                <div className="flex items-center gap-1 bg-muted rounded-md p-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={scrollLeft}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={goToToday}>
                    Today
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={scrollRight}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <div className="hidden sm:block text-sm text-muted-foreground mr-2">
                  {format(startDate, "MMM d")} - {format(addDays(startDate, daysToShow - 1), "MMM d, yyyy")}
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center gap-1 mr-2 bg-muted rounded-md p-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCellWidth(prev => Math.max(40, prev - 20))} disabled={cellWidth <= 40}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCellWidth(prev => Math.min(160, prev + 20))} disabled={cellWidth >= 160}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </div>

                {/* Theme Toggle */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" data-testid="theme-toggle">
                      {theme === "light" ? <Sun className="h-4 w-4" /> :
                        theme === "dark" ? <Moon className="h-4 w-4" /> :
                          <Monitor className="h-4 w-4" />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 p-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-3 text-center">Select Theme</p>
                    <div className="grid grid-cols-3 gap-3">
                      {/* Light */}
                      <button onClick={() => setTheme("light")} className={`h-10 w-10 rounded-full border-2 flex items-center justify-center transition-all bg-[#F8FAFC] ${theme === "light" ? "border-accent scale-110 shadow-md" : "border-border hover:scale-105"}`} title="Light">
                        {theme === "light" && <Check className="h-4 w-4 text-slate-800" />}
                      </button>
                      {/* Dark */}
                      <button onClick={() => setTheme("dark")} className={`h-10 w-10 rounded-full border-2 flex items-center justify-center transition-all bg-[#0F172A] ${theme === "dark" ? "border-accent scale-110 shadow-md" : "border-border hover:scale-105"}`} title="Dark">
                        {theme === "dark" && <Check className="h-4 w-4 text-white" />}
                      </button>
                      {/* System */}
                      <button onClick={() => setTheme("system")} className={`h-10 w-10 rounded-full border-2 flex items-center justify-center transition-all bg-gradient-to-br from-[#F8FAFC] to-[#0F172A] ${theme === "system" ? "border-accent scale-110 shadow-md" : "border-border hover:scale-105"}`} title="System">
                        <Monitor className={`h-4 w-4 ${theme === "system" ? "text-accent" : "text-muted-foreground mix-blend-difference"}`} />
                      </button>
                      {/* Slate */}
                      <button onClick={() => setTheme("slate")} className={`h-10 w-10 rounded-full border-2 flex items-center justify-center transition-all bg-[hsl(199,82%,42%)] ${theme === "slate" ? "border-accent scale-110 shadow-md" : "border-transparent hover:scale-105"}`} title="Slate">
                        {theme === "slate" && <Check className="h-4 w-4 text-white" />}
                      </button>
                      {/* Sage */}
                      <button onClick={() => setTheme("sage")} className={`h-10 w-10 rounded-full border-2 flex items-center justify-center transition-all bg-[hsl(158,60%,36%)] ${theme === "sage" ? "border-accent scale-110 shadow-md" : "border-transparent hover:scale-105"}`} title="Sage">
                        {theme === "sage" && <Check className="h-4 w-4 text-white" />}
                      </button>
                      {/* Midnight */}
                      <button onClick={() => setTheme("midnight")} className={`h-10 w-10 rounded-full border-2 flex items-center justify-center transition-all bg-[hsl(248,80%,65%)] ${theme === "midnight" ? "border-white scale-110 shadow-md" : "border-transparent hover:scale-105"}`} title="Midnight">
                        {theme === "midnight" && <Check className="h-4 w-4 text-white" />}
                      </button>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Calendar Sync */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={handleSyncCalendar} disabled={syncing}>
                      <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Sync to Google Calendar</TooltipContent>
                </Tooltip>

                {/* Drive Backup */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={handleBackupToDrive} disabled={backingUp}>
                      <HardDrive className={`h-4 w-4 ${backingUp ? "animate-pulse" : ""}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Backup to Google Drive</TooltipContent>
                </Tooltip>

                {/* Drive Restore */}
                <AlertDialog>
                  <Tooltip>
                    <AlertDialogTrigger asChild>
                      <TooltipTrigger asChild>
                        <Button variant="outline" size="icon" disabled={restoringFromDrive}>
                          <DownloadCloud className={`h-4 w-4 ${restoringFromDrive ? "animate-pulse" : ""}`} />
                        </Button>
                      </TooltipTrigger>
                    </AlertDialogTrigger>
                    <TooltipContent>Restore from Google Drive</TooltipContent>
                  </Tooltip>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will instantly overwrite your current Taskflow dashboard with the data previously backed up in Google Drive. Any recent un-backed-up progress will be permanently lost.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleRestoreFromDrive} className="bg-destructive hover:bg-destructive/90 text-white">
                        Yes, Overwrite Dashboard
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {/* Admin Panel Button */}
                {user?.is_admin && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setShowAdminPanel(true);
                          fetchAdminData();
                        }}
                      >
                        <ShieldAlert className="h-4 w-4 text-accent" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Admin Control Panel</TooltipContent>
                  </Tooltip>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)}>
                      <Settings className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Account Settings</TooltipContent>
                </Tooltip>

                {/* Bin */}
                <Button variant="outline" size="icon" onClick={() => setShowBin(true)} className="relative">
                  <Archive className="h-4 w-4" />
                  {deletedTasks.length > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                      {deletedTasks.length}
                    </span>
                  )}
                </Button>

                {/* Export CSV */}
                <Button variant="outline" size="icon" onClick={handleExportCSV}>
                  <Download className="h-4 w-4" />
                </Button>

                {/* User Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={user?.picture} alt={user?.name} />
                        <AvatarFallback>{user?.name?.charAt(0) || "U"}</AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-medium">{user?.name}</p>
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                      <Settings className="h-4 w-4 mr-2" /> Settings
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:bg-destructive focus:text-destructive-foreground">
                      <LogOut className="h-4 w-4 mr-2" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 container mx-auto px-4 md:px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold font-['Manrope']">Tasks</h2>
              <p className="text-sm text-muted-foreground">
                {tasks.length} task{tasks.length !== 1 ? "s" : ""} • Click checkbox to mark day complete
              </p>
            </div>
            <Button onClick={() => setShowAddTask(true)} className="active-scale">
              <Plus className="h-4 w-4 mr-2" /> Add Task
            </Button>
          </div>

          {/* Gantt Chart */}
          <div className="border border-border rounded-sm bg-card overflow-hidden">
            <div className="flex">
              {/* Fixed Left Panel */}
              <div className="flex-shrink-0 border-r border-border bg-card z-10 w-[430px]">
                <div className="flex border-b border-border bg-muted/50 h-12">
                  <div className="w-[180px] px-4 py-3 font-medium text-sm flex items-center cursor-pointer hover:bg-muted/80 transition-colors select-none"
                    onClick={() => toggleSort('created')}
                  >
                    Task / Subtask
                    {sortMode.startsWith('created') && (sortMode.endsWith('asc') ? <ChevronUp className="h-3 w-3 ml-2 text-primary" /> : <ChevronDown className="h-3 w-3 ml-2 text-primary" />)}
                  </div>
                  <div className="w-[95px] px-2 py-3 font-medium text-sm flex items-center justify-center">Date</div>
                  <div className="w-[75px] px-2 py-3 font-medium text-sm flex items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors select-none"
                    onClick={() => toggleSort('progress')}
                  >
                    Progress
                    {sortMode.startsWith('progress') && (sortMode.endsWith('asc') ? <ChevronUp className="h-3 w-3 ml-1 text-primary" /> : <ChevronDown className="h-3 w-3 ml-1 text-primary" />)}
                  </div>
                  <div className="w-[80px] px-2 py-3 font-medium text-sm flex items-center justify-center">Actions</div>
                </div>

                {tasks.length === 0 ? (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center px-4">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No tasks yet</p>
                    </div>
                  </div>
                ) : (
                  <DragDropContext onDragEnd={handleDragEnd}>
                    <Droppable droppableId="task-list-left">
                      {(provided) => (
                        <div {...provided.droppableProps} ref={provided.innerRef} className="flex-1 overflow-visible">
                          {sortedTasks.map((task, index) => {
                            const progress = calculateProgress(task);
                            const subtasks = task.subtasks || [];
                            const isEditing = editingTask === task.task_id;

                            return (
                              <Draggable key={task.task_id} draggableId={task.task_id} index={index} isDragDisabled={sortMode !== "manual"}>
                                {(provided) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    className="bg-card w-full"
                                  >
                                    {/* Task Row */}
                                    <div className="flex border-b border-border h-14 bg-muted/30">
                                      {isEditing ? (
                                        <>
                                          <div className="w-[160px] px-2 py-1 flex items-center">
                                            <Input value={editTaskName} onChange={(e) => setEditTaskName(e.target.value)} className="h-7 text-sm" autoFocus />
                                          </div>
                                          <div className="w-[95px]"></div>
                                          <div className="w-[75px] flex items-center justify-center">
                                            <span className="text-xs">{progress}%</span>
                                          </div>
                                          <div className="w-[80px] flex items-center justify-center gap-1">
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-success" onClick={() => handleUpdateTask(task.task_id)}>
                                              <Check className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingTask(null)}>
                                              <X className="h-3.5 w-3.5" />
                                            </Button>
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          <div className="w-[180px] px-2 py-2 flex items-center gap-1 hover:bg-muted/50 min-w-0">
                                            <div {...provided.dragHandleProps} className="text-muted-foreground/30 hover:text-muted-foreground cursor-grab p-1 shrink-0">
                                              <GripVertical className="h-4 w-4 shrink-0" />
                                            </div>
                                            <div className="flex-1 flex items-center gap-2 cursor-pointer min-w-0" onClick={() => handleExpandTask(task.task_id)}>
                                              <span className="font-medium text-sm line-clamp-2 break-words leading-tight flex-1">{task.name}</span>
                                              <span className={`text-[10px] shrink-0 transition-transform ${expandedTaskId === task.task_id ? "rotate-90" : ""}`}>▶</span>
                                            </div>
                                          </div>
                                          <div className="w-[95px] px-1 py-2 flex items-center justify-center">
                                            {subtasks.length > 0 ? (() => {
                                              const dates = subtasks.map(s => s.start_date).sort();
                                              const ends = subtasks.map(s => s.end_date).sort();
                                              return (
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <button
                                                      className="text-[10px] text-muted-foreground hover:text-primary transition-colors cursor-pointer flex items-center gap-1 bg-muted/30 px-2 py-1 rounded-md max-w-full"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (dates[0]) setStartDate(addDays(parseISO(dates[0]), -1));
                                                      }}
                                                    >
                                                      <Target className="h-3 w-3 shrink-0" />
                                                      <span className="truncate">{`${format(parseISO(dates[0]), "M/d")}–${format(parseISO(ends[ends.length - 1]), "M/d")}`}</span>
                                                    </button>
                                                  </TooltipTrigger>
                                                  <TooltipContent>Jump to task timeline</TooltipContent>
                                                </Tooltip>
                                              );
                                            })() : <span className="text-[10px] text-muted-foreground">—</span>}
                                          </div>
                                          <div className="w-[75px] px-2 py-2 flex flex-col items-center justify-center gap-0.5">
                                            <span className="text-xs font-medium text-accent">{progress}%</span>
                                            <Progress value={progress} className="h-1 w-full" />
                                          </div>
                                          <div className="w-[80px] flex items-center justify-center gap-1">
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingTask(task.task_id); setEditTaskName(task.name); }}>
                                              <Edit2 className="h-3 w-3" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" onClick={() => setDeleteConfirm(task)}>
                                              <Trash2 className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </>
                                      )}
                                    </div>

                                    {/* Subtask Rows */}
                                    {subtasks.map((subtask) => {
                                      const stCompletions = subtask.day_completions || {};
                                      const stTotal = Object.keys(stCompletions).length;
                                      const stDone = Object.values(stCompletions).filter(v => v.completed).length;
                                      const stProgress = stTotal > 0 ? Math.round((stDone / stTotal) * 100) : 0;
                                      const dateLabel = subtask.date_mode === "custom"
                                        ? `${(subtask.custom_dates || []).length} days`
                                        : subtask.date_mode === "alternate"
                                          ? `Alt. ${format(parseISO(subtask.start_date), "M/d")}–${format(parseISO(subtask.end_date), "M/d")}`
                                          : `${format(parseISO(subtask.start_date), "M/d")}–${format(parseISO(subtask.end_date), "M/d")}`;
                                      return (
                                        <div key={subtask.subtask_id} className="flex flex-col border-b border-border/50 h-[64px] overflow-hidden">
                                          {/* Top zone: time slot */}
                                          <div className="h-5 flex-shrink-0 flex items-center px-3 border-b border-border/20">
                                            <span className="text-[9px] font-mono text-muted-foreground/60 truncate pl-4">{subtask.time_slot || "—"}</span>
                                          </div>
                                          {/* Bottom zone: subtask info */}
                                          <div className="flex-1 flex items-center">
                                            <div className="w-[180px] px-3 flex items-center pl-7 min-w-0">
                                              <span className="text-xs line-clamp-2 break-words leading-tight text-muted-foreground">{subtask.name}</span>
                                            </div>
                                            <div className="w-[95px] px-1 flex items-center justify-center">
                                              <span className="text-[10px] text-muted-foreground text-center leading-tight">{dateLabel}</span>
                                            </div>
                                            <div className="w-[75px] px-1 flex flex-col items-center justify-center gap-0.5">
                                              <span className="text-[10px] font-medium text-accent">{stProgress}%</span>
                                              <Progress value={stProgress} className="h-1 w-full" />
                                            </div>
                                            <div className="w-[80px] flex items-center justify-center gap-0.5">
                                              <Button variant="ghost" size="icon" className="h-5 w-5"
                                                onClick={() => { handleExpandTask(task.task_id); setEditingSubtask({ subtask_id: subtask.subtask_id, name: subtask.name, start_date: subtask.start_date, end_date: subtask.end_date }); }}>
                                                <Edit2 className="h-3 w-3" />
                                              </Button>
                                              <Button variant="ghost" size="icon" className="h-5 w-5 hover:text-destructive"
                                                onClick={() => handleDeleteSubtask(subtask.subtask_id, task.task_id)}>
                                                <Trash2 className="h-3 w-3" />
                                              </Button>
                                            </div>
                                          </div>
                                        </div>

                                      );
                                    })}

                                    {/* Inline Subtask Expansion Panel */}
                                    {expandedTaskId === task.task_id && (
                                      <div ref={expandedPanelRef} className="border-b border-accent/30 bg-accent/5 px-4 py-3">
                                        <p className="text-xs font-semibold text-accent mb-2">Subtasks for {task.name}</p>

                                        {/* List existing subtasks */}
                                        {(taskSubtasksMap[task.task_id] || []).length === 0 && (
                                          <p className="text-xs text-muted-foreground mb-2">No subtasks yet</p>
                                        )}
                                        {(taskSubtasksMap[task.task_id] || []).map(st => (
                                          <div key={st.subtask_id} className="border-b border-border/30 py-1">
                                            {editingSubtask?.subtask_id === st.subtask_id ? (
                                              /* Edit mode */
                                              <div className="space-y-1.5">
                                                <Input
                                                  className="h-7 text-xs"
                                                  value={editingSubtask.name}
                                                  onChange={e => setEditingSubtask(p => ({ ...p, name: e.target.value }))}
                                                  autoFocus
                                                />
                                                <div className="flex gap-2">
                                                  <div className="flex-1">
                                                    <label className="text-[10px] text-muted-foreground">Start</label>
                                                    <Input type="date" className="h-7 text-xs" value={editingSubtask.start_date} max={editingSubtask.end_date}
                                                      onChange={e => setEditingSubtask(p => ({ ...p, start_date: e.target.value }))} />
                                                  </div>
                                                  <div className="flex-1">
                                                    <label className="text-[10px] text-muted-foreground">End</label>
                                                    <Input type="date" className="h-7 text-xs" value={editingSubtask.end_date} min={editingSubtask.start_date}
                                                      onChange={e => setEditingSubtask(p => ({ ...p, end_date: e.target.value }))} />
                                                  </div>
                                                </div>
                                                <div className="flex gap-1">
                                                  <Button size="sm" className="h-6 text-xs flex-1" onClick={() => handleUpdateSubtask(task.task_id)}>
                                                    <Check className="h-3 w-3 mr-1" /> Save
                                                  </Button>
                                                  <Button size="sm" variant="outline" className="h-6 text-xs flex-1" onClick={() => setEditingSubtask(null)}>
                                                    <X className="h-3 w-3 mr-1" /> Cancel
                                                  </Button>
                                                </div>
                                              </div>
                                            ) : (
                                              /* View mode */
                                              <div className="flex items-center justify-between">
                                                <span className="text-xs">{st.name}</span>
                                                <div className="flex items-center gap-1">
                                                  <Tooltip>
                                                    <TooltipTrigger asChild>
                                                      <span className="text-[10px] text-muted-foreground hover:text-primary transition-colors cursor-pointer flex items-center gap-1 bg-muted/30 px-2 py-0.5 rounded"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          const d = st.date_mode === "custom" && st.custom_dates?.length > 0 ? st.custom_dates[0] : st.start_date;
                                                          if (d) setStartDate(addDays(parseISO(d), -1));
                                                        }}
                                                      >
                                                        <Target className="h-3 w-3 shrink-0" />
                                                        {st.date_mode === "custom" ? `${(st.custom_dates || []).length} days` :
                                                          st.date_mode === "alternate" ? `Alt. ${format(parseISO(st.start_date), "M/d")}–${format(parseISO(st.end_date), "M/d")}` :
                                                            `${format(parseISO(st.start_date), "M/d")}–${format(parseISO(st.end_date), "M/d")}`}
                                                      </span>
                                                    </TooltipTrigger>
                                                    <TooltipContent>Jump to subtask timeline</TooltipContent>
                                                  </Tooltip>
                                                  <Button variant="ghost" size="icon" className="h-5 w-5"
                                                    onClick={() => setEditingSubtask({ subtask_id: st.subtask_id, name: st.name, start_date: st.start_date, end_date: st.end_date })}>
                                                    <Edit2 className="h-3 w-3" />
                                                  </Button>
                                                  <Button variant="ghost" size="icon" className="h-5 w-5 hover:text-destructive"
                                                    onClick={() => handleDeleteSubtask(st.subtask_id, task.task_id)}>
                                                    <Trash2 className="h-3 w-3" />
                                                  </Button>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        ))}


                                        {/* Add new subtask form */}
                                        <div className="mt-3 space-y-2">
                                          <p className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider">Add Subtask</p>
                                          <Input
                                            placeholder="Subtask name..."
                                            className="h-7 text-xs"
                                            value={newSubtask.name}
                                            onChange={e => setNewSubtask(p => ({ ...p, name: e.target.value }))}
                                          />
                                          {/* Date Mode Selector */}
                                          <div className="flex gap-1">
                                            {["range", "alternate", "custom"].map(mode => (
                                              <button
                                                key={mode}
                                                type="button"
                                                onClick={() => setNewSubtask(p => ({ ...p, date_mode: mode, custom_dates: [] }))}
                                                className={`text-[10px] px-2 py-1 rounded border transition-colors ${newSubtask.date_mode === mode
                                                  ? "bg-accent text-accent-foreground border-accent"
                                                  : "border-border text-muted-foreground hover:border-accent/50"
                                                  }`}
                                              >
                                                {mode === "range" ? "📅 Date Range" : mode === "alternate" ? "⏰ Alternate Days" : "🗓️ Custom Dates"}
                                              </button>
                                            ))}
                                          </div>

                                          {/* Date inputs for range / alternate */}
                                          {newSubtask.date_mode !== "custom" && (
                                            <div className="flex gap-2">
                                              <div className="flex-1">
                                                <label className="text-[10px] text-muted-foreground">Start</label>
                                                <Input type="date" className="h-7 text-xs" value={newSubtask.start_date} max={newSubtask.end_date} onChange={e => setNewSubtask(p => ({ ...p, start_date: e.target.value }))} />
                                              </div>
                                              <div className="flex-1">
                                                <label className="text-[10px] text-muted-foreground">End</label>
                                                <Input type="date" className="h-7 text-xs" value={newSubtask.end_date} min={newSubtask.start_date} onChange={e => setNewSubtask(p => ({ ...p, end_date: e.target.value }))} />
                                              </div>
                                            </div>
                                          )}

                                          {/* Custom date picker */}
                                          {newSubtask.date_mode === "custom" && (
                                            <div>
                                              <p className="text-[10px] text-muted-foreground mb-1">Click dates to select ({newSubtask.custom_dates.length} selected)</p>
                                              <Calendar
                                                mode="multiple"
                                                selected={(newSubtask.custom_dates || []).map(d => parseISO(d))}
                                                onSelect={(dates) => setNewSubtask(p => ({ ...p, custom_dates: (dates || []).map(d => format(d, "yyyy-MM-dd")), start_date: dates?.[0] ? format(dates[0], "yyyy-MM-dd") : p.start_date, end_date: dates?.[dates.length - 1] ? format(dates[dates.length - 1], "yyyy-MM-dd") : p.end_date }))}
                                                className="rounded-sm border border-border text-xs scale-90 origin-top-left"
                                              />
                                            </div>
                                          )}

                                          {/* Time slot */}
                                          <div>
                                            <label className="text-[10px] text-muted-foreground">Time Slot (optional)</label>
                                            <Input
                                              className="h-7 text-xs font-mono"
                                              placeholder="09:00-10:00"
                                              value={newSubtask.time_slot || ""}
                                              onChange={e => setNewSubtask(p => ({ ...p, time_slot: e.target.value }))}
                                            />
                                            <p className="text-[9px] text-muted-foreground/60 mt-0.5">Format: HH:MM-HH:MM (e.g. 09:15-10:30)</p>
                                          </div>

                                          <Button size="sm" className="h-7 text-xs w-full" disabled={addingSubtask || !!(newSubtask.time_slot && !validateTimeSlot(newSubtask.time_slot))} onClick={() => handleAddSubtask(task.task_id)}>
                                            <Plus className="h-3 w-3 mr-1" /> {addingSubtask ? "Adding..." : "Add Subtask"}
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                )}
              </div>

              {/* Scrollable Gantt Area */}
              <div className="flex-1 overflow-x-auto" ref={scrollContainerRef}>
                <div style={{ minWidth: dateColumns.length * cellWidth }}>
                  {/* Date Headers */}
                  <div className="flex border-b border-border bg-muted/50 h-12">
                    {dateColumns.map((date, index) => {
                      const isCurrentDay = isToday(date);
                      return (
                        <div key={index} className={`flex-shrink-0 flex flex-col items-center justify-center border-r border-border/50 ${isCurrentDay ? "bg-accent/10" : ""}`} style={{ width: cellWidth }}>
                          <span className="text-[8px] text-muted-foreground uppercase">{format(date, "EEE")}</span>
                          <span className={`text-[10px] ${isCurrentDay ? "font-bold text-accent" : ""}`}>{format(date, "d")}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Task/Subtask Rows */}
                  {sortedTasks.map((task) => {
                    const subtasks = task.subtasks || [];

                    return (
                      <div key={task.task_id}>
                        {/* Task Row - empty */}
                        <div className="flex border-b border-border h-14 bg-muted/30">
                          {dateColumns.map((date, index) => (
                            <div key={index} className={`flex-shrink-0 border-r border-border/30 ${isToday(date) ? "bg-accent/5" : ""}`} style={{ width: cellWidth }} />
                          ))}
                        </div>

                        {/* Subtask Rows with Day-by-Day Checkboxes */}
                        {subtasks.map((subtask) => (
                          <div key={subtask.subtask_id} className="flex border-b border-border/50 h-[64px]">
                            {dateColumns.map((date, index) => {
                              const dateStr = format(date, "yyyy-MM-dd");
                              const inRange = isDateInSubtaskRange(subtask, dateStr);
                              const completed = isDayCompleted(subtask, dateStr);
                              const overdue = isOverdue(subtask, dateStr);
                              const isCurrentDay = isToday(date);
                              const existingNote = subtask.day_completions?.[dateStr]?.notes || "";
                              const existingCompletedAtRaw = subtask.day_completions?.[dateStr]?.completed_at;
                              const existingCompletedAtDisplay = existingCompletedAtRaw ? format(parseISO(existingCompletedAtRaw), "MMM d, HH:mm") : "";
                              const existingCompletedAtValue = existingCompletedAtRaw ? format(parseISO(existingCompletedAtRaw), "yyyy-MM-dd'T'HH:mm") : "";
                              const hasNote = existingNote.trim().length > 0;
                              return (
                                <div
                                  key={index}
                                  className={`flex-shrink-0 border-r border-border/30 flex flex-col ${isCurrentDay ? "bg-accent/15" : ""} ${inRange ? (completed ? "bg-success/30" : overdue ? "bg-destructive/25" : "bg-accent/15") : ""}`}
                                  style={{ width: cellWidth, minHeight: 64 }}
                                >
                                  {/* Top: time slot (click to edit — one popover per subtask/date) */}
                                  <div className="h-5 flex-shrink-0 flex items-center justify-center border-b border-border/20">
                                    {inRange && (
                                      <Popover
                                        open={editingSlot?.key === `${subtask.subtask_id}:${dateStr}`}
                                        onOpenChange={(open) => {
                                          if (!open) setEditingSlot(null);
                                        }}
                                      >
                                        <PopoverTrigger asChild>
                                          <button
                                            type="button"
                                            className="text-[9px] font-mono text-muted-foreground/60 leading-none hover:text-accent transition-colors px-0.5 rounded"
                                            onClick={() => {
                                              const daySlot = subtask.day_completions?.[dateStr]?.time_slot;
                                              const defaultSlot = subtask.time_slot || "";
                                              setEditingSlot({ key: `${subtask.subtask_id}:${dateStr}`, subtaskId: subtask.subtask_id, dateStr, value: daySlot ?? defaultSlot });
                                            }}
                                          >
                                            {subtask.day_completions?.[dateStr]?.time_slot || subtask.time_slot || "—"}
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-52 p-2" side="top">
                                          <p className="text-[10px] text-muted-foreground mb-1">Time slot for {dateStr}</p>
                                          <p className="text-[9px] text-muted-foreground/50 mb-1">Default: {subtask.time_slot || "none"}</p>
                                          <Input
                                            className={`h-7 text-xs font-mono ${editingSlot?.key === `${subtask.subtask_id}:${dateStr}` && editingSlot.value && !validateTimeSlot(editingSlot.value) ? "border-destructive focus-visible:ring-destructive" : ""}`}
                                            placeholder="09:00-10:00"
                                            value={editingSlot?.key === `${subtask.subtask_id}:${dateStr}` ? (editingSlot.value ?? "") : ""}
                                            onChange={e => setEditingSlot(p => ({ ...p, value: formatTimeSlotInput(e.target.value) }))}
                                            onKeyDown={async (e) => {
                                              if (e.key === "Enter") {
                                                e.preventDefault();
                                                if (!validateTimeSlot(editingSlot.value)) return;
                                                if (!subtask.time_slot) {
                                                  // First time: set as default for all cells
                                                  await fetch(`${API}/subtasks/${subtask.subtask_id}`, {
                                                    method: "PUT",
                                                    headers: {
                                                      "Content-Type": "application/json",
                                                      ...getAuthHeaders()
                                                    },
                                                    credentials: "include",
                                                    body: JSON.stringify({ time_slot: editingSlot.value }),
                                                  });
                                                } else {
                                                  // Subsequent: per-day override only
                                                  const cur = subtask.day_completions?.[dateStr] || {};
                                                  await fetch(`${API}/subtasks/${subtask.subtask_id}/day/${dateStr}`, {
                                                    method: "PUT",
                                                    headers: {
                                                      "Content-Type": "application/json",
                                                      ...getAuthHeaders()
                                                    },
                                                    credentials: "include",
                                                    body: JSON.stringify({ date: dateStr, completed: cur.completed || false, notes: cur.notes || "", time_slot: editingSlot.value }),
                                                  });
                                                }
                                                setEditingSlot(null);
                                                await fetchTasks();
                                              }
                                              if (e.key === "Escape") setEditingSlot(null);
                                            }}
                                          />
                                          {editingSlot?.key === `${subtask.subtask_id}:${dateStr}` && editingSlot.value && !validateTimeSlot(editingSlot.value) && (
                                            <p className="text-[10px] text-destructive mt-0.5">Use HH:MM-HH:MM, end must be after start</p>
                                          )}
                                          <div className="flex gap-1 mt-1">
                                            <Button size="sm" className="h-6 text-xs flex-1"
                                              disabled={!!(editingSlot?.value && !validateTimeSlot(editingSlot.value))}
                                              onClick={async () => {
                                                if (!validateTimeSlot(editingSlot.value)) return;
                                                if (!subtask.time_slot) {
                                                  // First time: set as default for all cells
                                                  await fetch(`${API}/subtasks/${subtask.subtask_id}`, {
                                                    method: "PUT",
                                                    headers: {
                                                      "Content-Type": "application/json",
                                                      ...getAuthHeaders()
                                                    },
                                                    credentials: "include",
                                                    body: JSON.stringify({ time_slot: editingSlot.value }),
                                                  });
                                                } else {
                                                  // Subsequent: per-day override only
                                                  const cur = subtask.day_completions?.[dateStr] || {};
                                                  await fetch(`${API}/subtasks/${subtask.subtask_id}/day/${dateStr}`, {
                                                    method: "PUT",
                                                    headers: {
                                                      "Content-Type": "application/json",
                                                      ...getAuthHeaders()
                                                    },
                                                    credentials: "include",
                                                    body: JSON.stringify({ date: dateStr, completed: cur.completed || false, notes: cur.notes || "", time_slot: editingSlot.value }),
                                                  });
                                                }
                                                setEditingSlot(null);
                                                await fetchTasks();
                                              }}>Save</Button>
                                            <Button size="sm" variant="outline" className="h-6 text-xs"
                                              title="Reset to default"
                                              onClick={async () => {
                                                const cur = subtask.day_completions?.[dateStr] || {};
                                                await fetch(`${API}/subtasks/${subtask.subtask_id}/day/${dateStr}`, {
                                                  method: "PUT",
                                                  headers: {
                                                    "Content-Type": "application/json",
                                                    ...getAuthHeaders()
                                                  },
                                                  credentials: "include",
                                                  body: JSON.stringify({ date: dateStr, completed: cur.completed || false, notes: cur.notes || "", time_slot: "" }),
                                                });
                                                setEditingSlot(null);
                                                await fetchTasks();
                                              }}>↺</Button>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    )}
                                  </div>
                                  {/* Bottom: checkbox + comment */}
                                  <div className="flex-1 flex flex-col items-center justify-center gap-0.5 py-0.5">
                                    {inRange && (() => {
                                      const status = subtask.day_completions?.[dateStr]?.status || (completed ? "completed" : "empty");
                                      const isCompleted = status === "completed";
                                      const isFailed = status === "failed";
                                      return (
                                        <button
                                          type="button"
                                          onClick={() => handleToggleDayCompletion(subtask, dateStr, status)}
                                          className={`h-4 w-4 shrink-0 rounded-sm border shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring flex items-center justify-center text-white transition-colors
                                            ${isCompleted ? "bg-success border-success" :
                                              isFailed ? "bg-destructive border-destructive" :
                                                overdue ? "border-destructive bg-transparent hover:bg-muted" :
                                                  "border-primary bg-transparent hover:bg-muted"
                                            }`}
                                        >
                                          {isCompleted && <Check className="h-3 w-3" />}
                                          {isFailed && <X className="h-3 w-3" />}
                                        </button>
                                      );
                                    })()}
                                    {inRange && (
                                      <Popover
                                        open={dayComment.subtaskId === subtask.subtask_id && dayComment.date === dateStr && dayComment.open}
                                        onOpenChange={(open) => {
                                          if (open) {
                                            setDayComment({ subtaskId: subtask.subtask_id, date: dateStr, text: existingNote, completedAt: existingCompletedAtValue, open: true });
                                          } else {
                                            handleSaveComment();
                                            setDayComment(p => ({ ...p, open: false }));
                                          }
                                        }}
                                      >
                                        <PopoverTrigger asChild>
                                          <button
                                            type="button"
                                            className={`p-0 h-4 flex items-center justify-center rounded transition-colors ${hasNote || (completed && existingCompletedAtRaw && cellWidth >= 80)
                                              ? cellWidth >= 80
                                                ? "text-accent max-w-full px-1 hover:bg-black/5 dark:hover:bg-white/5 flex-col justify-center"
                                                : "text-accent w-3"
                                              : "text-muted-foreground/30 hover:text-muted-foreground w-3"
                                              }`}
                                          >
                                            {hasNote && cellWidth >= 80 ? (
                                              <span className="text-[9px] truncate w-full text-center leading-[10px]" title={existingNote}>
                                                {existingNote}
                                              </span>
                                            ) : (completed && existingCompletedAtRaw && !hasNote && cellWidth >= 80) ? (
                                              <span className="text-[9px] font-mono text-muted-foreground/80 leading-[10px]">{existingCompletedAtDisplay}</span>
                                            ) : (
                                              <MessageSquare className="h-2.5 w-2.5 shrink-0" />
                                            )}
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-56 p-3" side="top">
                                          <div className="flex items-center justify-between mb-2">
                                            <p className="text-xs font-medium text-foreground">{format(date, "MMM d")} Notes</p>
                                          </div>

                                          {completed && (
                                            <div className="flex items-center gap-2 mb-3">
                                              <label className="text-[10px] whitespace-nowrap text-muted-foreground">Done at:</label>
                                              <Input
                                                type="datetime-local"
                                                className="h-7 text-xs flex-1"
                                                value={dayComment.subtaskId === subtask.subtask_id && dayComment.date === dateStr ? dayComment.completedAt : existingCompletedAtValue}
                                                onChange={e => setDayComment(p => ({ ...p, completedAt: e.target.value }))}
                                              />
                                            </div>
                                          )}

                                          <Textarea
                                            className="text-xs h-16 resize-none mb-2"
                                            placeholder="Add an optional note..."
                                            value={dayComment.subtaskId === subtask.subtask_id && dayComment.date === dateStr ? dayComment.text : existingNote}
                                            onChange={e => setDayComment(p => ({ ...p, text: e.target.value }))}
                                          />
                                          <Button
                                            size="sm"
                                            className="mt-1 h-6 text-xs w-full"
                                            onClick={() => {
                                              handleSaveComment();
                                              setDayComment(p => ({ ...p, open: false }));
                                            }}
                                          >
                                            Save
                                          </Button>
                                        </PopoverContent>
                                      </Popover>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ))}

                        {/* Expansion spacer row in grid side */}
                        {expandedTaskId === task.task_id && (
                          <div className="border-b border-accent/30 bg-accent/5" style={{ height: expandedPanelHeight > 0 ? expandedPanelHeight : 8 }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>{/* closes: flex container */}
          </div>{/* closes: gantt border wrapper */}

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-accent/40"></div><span>In Range</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-success/40"></div><span>Completed</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-destructive/40"></div><span>Overdue</span></div>
          </div>
        </main>


        {/* Dialogs */}
        <Dialog open={showAddTask} onOpenChange={setShowAddTask}>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Task</DialogTitle>
              <DialogDescription>Create a new task, then add subtasks with date ranges.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Task Name</label>
                <Input placeholder="Enter task name..." value={newTask.name} onChange={(e) => setNewTask({ ...newTask, name: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddTask(false)}>Cancel</Button>
              <Button onClick={handleAddTask}>Create Task</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog >

        <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move to Bin</DialogTitle>
              <DialogDescription>Are you sure you want to move "{deleteConfirm?.name}" to bin?</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => handleDeleteTask(deleteConfirm?.task_id)}>Move to Bin</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showBin} onOpenChange={setShowBin}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Archive className="h-5 w-5" /> Bin ({deletedTasks.length} items)</DialogTitle>
              <DialogDescription>Restore or permanently delete tasks.</DialogDescription>
            </DialogHeader>
            <div className="py-4 max-h-[400px] overflow-y-auto">
              {deletedTasks.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Bin is empty</p>
              ) : (
                <div className="space-y-2">
                  {deletedTasks.map((task) => (
                    <div key={task.task_id} className="flex items-center justify-between p-3 border border-border rounded-sm">
                      <div>
                        <p className="font-medium">{task.name}</p>
                        <p className="text-xs text-muted-foreground">Deleted {task.deleted_at ? format(parseISO(task.deleted_at), "MMM d, yyyy") : ""}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleRestoreTask(task.task_id)}>
                          <RotateCcw className="h-4 w-4 mr-1" /> Restore
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handlePermanentDelete(task.task_id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Settings Dialog */}
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Account Settings</DialogTitle>
              <DialogDescription>Configure system preferences and backups</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-4">
              <div className="flex flex-col gap-4 bg-muted/30 p-4 rounded-lg border border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-sm">Automated Google Drive Backups</h4>
                    <p className="text-xs text-muted-foreground">Securely encrypt and export your tasks daily.</p>
                  </div>
                  <div
                    className={`w-10 h-5 rounded-full cursor-pointer transition-colors relative flex items-center ${user?.auto_backup_enabled ? 'bg-primary' : 'bg-muted-foreground'}`}
                    onClick={() => setUser(prev => ({ ...prev, auto_backup_enabled: !prev?.auto_backup_enabled }))}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm absolute transition-transform transform ${user?.auto_backup_enabled ? 'translate-x-5' : 'translate-x-1'}`}></div>
                  </div>
                </div>

                {user?.auto_backup_enabled && (
                  <div className="grid grid-cols-2 items-center gap-4 mt-2">
                    <p className="text-sm font-medium">Backup Time</p>
                    <Input
                      type="time"
                      value={user?.auto_backup_time || "00:00"}
                      onChange={(e) => setUser(prev => ({ ...prev, auto_backup_time: e.target.value }))}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-4 bg-muted/30 p-4 rounded-lg border border-border opacity-70">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-sm flex items-center gap-2">
                      Daily Email Reminders
                      <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Coming Soon</span>
                    </h4>
                    <p className="text-xs text-muted-foreground">Receive a clean HTML summary of today's schedule.</p>
                  </div>
                  <div
                    className="w-10 h-5 rounded-full cursor-not-allowed bg-muted-foreground/30 relative flex items-center"
                    title="This feature is temporarily disabled for privacy"
                  >
                    <div className="w-4 h-4 rounded-full bg-white/50 shadow-sm absolute transition-transform transform translate-x-1"></div>
                  </div>
                </div>

                {user?.email_reminders_enabled && (
                  <div className="grid grid-cols-2 items-center gap-4 mt-2 opacity-50 grayscale pointer-events-none">
                    <p className="text-sm font-medium">Delivery Time</p>
                    <Input
                      type="time"
                      disabled
                      value={user?.email_reminder_time || "08:00"}
                    />
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveSettings}>Save Preferences</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Admin Panel Dialog */}
        <Dialog open={showAdminPanel} onOpenChange={setShowAdminPanel}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Admin Control Panel</DialogTitle>
              <DialogDescription>Manage users, approvals, and system-wide settings.</DialogDescription>
            </DialogHeader>
            <div className="space-y-8 py-4">
              {/* System Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <HardDrive className="h-5 w-5 text-accent" /> System Configuration
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg border border-border">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Maximum Total Users</label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={adminSettings.max_users}
                        onChange={e => setAdminSettings(p => ({ ...p, max_users: parseInt(e.target.value) }))}
                        className="h-9"
                      />
                      <Button size="sm" onClick={handleUpdateAdminSettings}>Update</Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Sets the hard cap for new Google signups.</p>
                  </div>
                  <div className="space-y-1.5 flex flex-col justify-center">
                    <label className="text-sm font-medium">SMTP Diagnostics</label>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full flex items-center gap-2"
                      onClick={handleTestEmail}
                    >
                      <Bell className="h-4 w-4" /> Send Test Email
                    </Button>
                    <p className="text-[10px] text-muted-foreground">Sends a diagnostic email to {user?.email}.</p>
                  </div>
                  <div className="space-y-1.5 flex flex-col justify-center">
                    <label className="text-sm font-medium">Total Active Users</label>
                    <p className="text-2xl font-bold text-accent">{adminUsers.length}</p>
                  </div>
                </div>
              </div>

              {/* Users Table */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">User Management</h3>
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={fetchAdminData} disabled={isLoadingAdmin}>
                    <RefreshCw className={`h-3 w-3 mr-2 ${isLoadingAdmin ? "animate-spin" : ""}`} /> Refresh List
                  </Button>
                </div>
                <div className="border border-border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-muted-foreground uppercase text-[10px] font-bold">
                      <tr>
                        <th className="px-4 py-3 text-left">User</th>
                        <th className="px-4 py-3 text-left">Status</th>
                        <th className="px-4 py-3 text-left">Role</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {adminUsers.map(u => (
                        <tr key={u.user_id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {u.picture ? (
                                <img src={u.picture} className="w-8 h-8 rounded-full border border-border" alt="" />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold">
                                  {u.name?.[0]}
                                </div>
                              )}
                              <div>
                                <p className="font-medium">{u.name}</p>
                                <p className="text-[11px] text-muted-foreground">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {u.is_approved ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-success/10 text-success border border-success/20 uppercase tracking-wider">Approved</span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-warning/10 text-warning border border-warning/20 uppercase tracking-wider">Pending</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {u.is_admin ? (
                              <span className="text-accent font-bold text-xs uppercase tracking-tighter">Admin</span>
                            ) : (
                              <span className="text-muted-foreground text-xs uppercase tracking-tighter">User</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right space-x-2">
                            {!u.is_approved && (
                              <Button size="sm" variant="default" className="h-7 text-[10px]" onClick={() => handleApproveUser(u.user_id)}>Approve</Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => handleToggleAdmin(u.user_id)}>
                              {u.is_admin ? "Demote" : "Make Admin"}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteUser(u.user_id)}>
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default Dashboard;
