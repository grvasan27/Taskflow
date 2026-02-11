import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
  MessageSquare,
  Download,
  RefreshCw,
  HardDrive,
  Edit2,
  Check,
  X,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { format, addDays, parseISO, isToday, startOfDay, isBefore } from "date-fns";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const CELL_WIDTH = 40;

const Dashboard = ({ user, setUser }) => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(addDays(startOfDay(new Date()), -14));
  const [daysToShow, setDaysToShow] = useState(42);
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
  const [editingTask, setEditingTask] = useState(null);
  const [editTaskName, setEditTaskName] = useState("");
  const [editTaskReminder, setEditTaskReminder] = useState("");
  const scrollContainerRef = useRef(null);
  const notificationIntervalRef = useRef(null);

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
      const response = await fetch(`${API}/tasks`, { credentials: "include" });
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
      const response = await fetch(`${API}/tasks/bin`, { credentials: "include" });
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
      const response = await fetch(`${API}/calendar/status`, { credentials: "include" });
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
      await fetch(`${API}/tasks/${taskId}`, { method: "DELETE", credentials: "include" });
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
      await fetch(`${API}/tasks/${taskId}/restore`, { method: "POST", credentials: "include" });
      await fetchTasks();
      await fetchDeletedTasks();
      toast.success("Task restored");
    } catch (error) {
      toast.error("Failed to restore task");
    }
  };

  const handlePermanentDelete = async (taskId) => {
    try {
      await fetch(`${API}/tasks/${taskId}/permanent`, { method: "DELETE", credentials: "include" });
      await fetchDeletedTasks();
      toast.success("Task permanently deleted");
    } catch (error) {
      toast.error("Failed to delete task");
    }
  };

  // Day completion toggle
  const handleToggleDayCompletion = async (subtaskId, date, currentCompleted) => {
    try {
      const response = await fetch(`${API}/subtasks/${subtaskId}/day/${date}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ date, completed: !currentCompleted, notes: "" }),
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
      const response = await fetch(`${API}/tasks/export/csv`, { credentials: "include" });
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
      const response = await fetch(`${API}/calendar/sync`, { method: "POST", credentials: "include" });
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
      const response = await fetch(`${API}/drive/backup`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error("Failed to backup");
      const data = await response.json();
      toast.success(data.message);
    } catch (error) {
      toast.error("Failed to backup to Drive");
    } finally {
      setBackingUp(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
    } catch (error) {
      console.error("Logout error:", error);
    }
    navigate("/", { replace: true });
  };

  const openSubtaskPage = (taskId) => window.open(`/task/${taskId}`, "_blank");

  // Calculate progress
  const calculateProgress = (task) => {
    const totalDays = task.total_days || 0;
    const completedDays = task.completed_days || 0;
    return totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;
  };

  // Check if date is in subtask range
  const isDateInSubtaskRange = (subtask, dateStr) => {
    return dateStr >= subtask.start_date && dateStr <= subtask.end_date;
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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

                <div className="hidden sm:block text-sm text-muted-foreground">
                  {format(startDate, "MMM d")} - {format(addDays(startDate, daysToShow - 1), "MMM d, yyyy")}
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
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setTheme("light")}>
                      <Sun className="mr-2 h-4 w-4" /> Light
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("dark")}>
                      <Moon className="mr-2 h-4 w-4" /> Dark
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("system")}>
                      <Monitor className="mr-2 h-4 w-4" /> System
                    </DropdownMenuItem>
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
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="mr-2 h-4 w-4" /> Logout
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
              <h2 className="text-2xl font-semibold font-['Manrope']">Gantt View</h2>
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
              <div className="flex-shrink-0 border-r border-border bg-card z-10">
                <div className="flex border-b border-border bg-muted/50 h-12">
                  <div className="w-[180px] px-4 py-3 font-medium text-sm flex items-center">Task / Subtask</div>
                  <div className="w-[60px] px-2 py-3 font-medium text-sm flex items-center justify-center">
                    <Bell className="h-3.5 w-3.5" />
                  </div>
                  <div className="w-[70px] px-2 py-3 font-medium text-sm flex items-center justify-center">Progress</div>
                  <div className="w-[60px] px-2 py-3 font-medium text-sm flex items-center justify-center">Actions</div>
                </div>

                {tasks.length === 0 ? (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center px-4">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No tasks yet</p>
                    </div>
                  </div>
                ) : (
                  tasks.map((task) => {
                    const progress = calculateProgress(task);
                    const subtasks = task.subtasks || [];
                    const isEditing = editingTask === task.task_id;

                    return (
                      <div key={task.task_id}>
                        {/* Task Row */}
                        <div className="flex border-b border-border h-10 bg-muted/30">
                          {isEditing ? (
                            <>
                              <div className="w-[180px] px-2 py-1 flex items-center">
                                <Input value={editTaskName} onChange={(e) => setEditTaskName(e.target.value)} className="h-7 text-sm" autoFocus />
                              </div>
                              <div className="w-[60px] px-1 py-1 flex items-center">
                                <Input type="time" value={editTaskReminder} onChange={(e) => setEditTaskReminder(e.target.value)} className="h-7 text-xs px-1" />
                              </div>
                              <div className="w-[70px] flex items-center justify-center">
                                <span className="text-xs">{progress}%</span>
                              </div>
                              <div className="w-[60px] flex items-center justify-center gap-1">
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
                              <div className="w-[180px] px-4 py-2 flex items-center gap-2 cursor-pointer hover:bg-muted/50" onClick={() => openSubtaskPage(task.task_id)}>
                                <span className="font-medium truncate text-sm">{task.name}</span>
                                <ExternalLink className="h-3 w-3 opacity-40" />
                              </div>
                              <div className="w-[60px] px-2 py-2 flex items-center justify-center">
                                <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{task.reminder_time}</span>
                              </div>
                              <div className="w-[70px] px-2 py-2 flex flex-col items-center justify-center gap-0.5">
                                <span className="text-xs font-medium text-accent">{progress}%</span>
                                <Progress value={progress} className="h-1 w-full" />
                              </div>
                              <div className="w-[60px] flex items-center justify-center gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingTask(task.task_id); setEditTaskName(task.name); setEditTaskReminder(task.reminder_time); }}>
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
                        {subtasks.map((subtask) => (
                          <div key={subtask.subtask_id} className="flex border-b border-border/50 h-8">
                            <div className="w-[180px] px-4 py-1 flex items-center gap-2 pl-6">
                              <span className="text-xs truncate text-muted-foreground">{subtask.name}</span>
                            </div>
                            <div className="w-[60px]"></div>
                            <div className="w-[70px] px-2 flex items-center justify-center">
                              <span className="text-[10px] text-muted-foreground">
                                {format(parseISO(subtask.start_date), "M/d")}-{format(parseISO(subtask.end_date), "M/d")}
                              </span>
                            </div>
                            <div className="w-[60px]"></div>
                          </div>
                        ))}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Scrollable Gantt Area */}
              <div className="flex-1 overflow-x-auto" ref={scrollContainerRef}>
                <div style={{ minWidth: dateColumns.length * CELL_WIDTH }}>
                  {/* Date Headers */}
                  <div className="flex border-b border-border bg-muted/50 h-12">
                    {dateColumns.map((date, index) => {
                      const isCurrentDay = isToday(date);
                      return (
                        <div key={index} className={`flex-shrink-0 flex flex-col items-center justify-center border-r border-border/50 ${isCurrentDay ? "bg-accent/10" : ""}`} style={{ width: CELL_WIDTH }}>
                          <span className="text-[8px] text-muted-foreground uppercase">{format(date, "EEE")}</span>
                          <span className={`text-[10px] ${isCurrentDay ? "font-bold text-accent" : ""}`}>{format(date, "d")}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Task/Subtask Rows */}
                  {tasks.map((task) => {
                    const subtasks = task.subtasks || [];

                    return (
                      <div key={task.task_id}>
                        {/* Task Row - empty */}
                        <div className="flex border-b border-border h-10 bg-muted/30">
                          {dateColumns.map((date, index) => (
                            <div key={index} className={`flex-shrink-0 border-r border-border/30 ${isToday(date) ? "bg-accent/5" : ""}`} style={{ width: CELL_WIDTH }} />
                          ))}
                        </div>

                        {/* Subtask Rows with Day-by-Day Checkboxes */}
                        {subtasks.map((subtask) => (
                          <div key={subtask.subtask_id} className="flex border-b border-border/50 h-8">
                            {dateColumns.map((date, index) => {
                              const dateStr = format(date, "yyyy-MM-dd");
                              const inRange = isDateInSubtaskRange(subtask, dateStr);
                              const completed = isDayCompleted(subtask, dateStr);
                              const overdue = isOverdue(subtask, dateStr);
                              const isCurrentDay = isToday(date);

                              return (
                                <div key={index} className={`flex-shrink-0 border-r border-border/30 flex items-center justify-center ${isCurrentDay ? "bg-accent/5" : ""} ${inRange ? (completed ? "bg-success/10" : overdue ? "bg-destructive/10" : "bg-accent/5") : ""}`} style={{ width: CELL_WIDTH }}>
                                  {inRange && (
                                    <Checkbox
                                      checked={completed}
                                      onCheckedChange={() => handleToggleDayCompletion(subtask.subtask_id, dateStr, completed)}
                                      className={`h-4 w-4 ${completed ? "bg-success border-success" : overdue ? "border-destructive" : ""}`}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-accent/20"></div><span>In Range</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-success/20"></div><span>Completed</span></div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-destructive/20"></div><span>Overdue</span></div>
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
              <div className="space-y-2">
                <label className="text-sm font-medium">Daily Reminder Time</label>
                <Input type="time" value={newTask.reminder_time} onChange={(e) => setNewTask({ ...newTask, reminder_time: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddTask(false)}>Cancel</Button>
              <Button onClick={handleAddTask}>Create Task</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
      </div>
    </TooltipProvider>
  );
};

export default Dashboard;
