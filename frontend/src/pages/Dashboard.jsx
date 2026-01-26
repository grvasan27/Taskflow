import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  BellRing,
  Check,
  X,
  MessageSquare,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { format, addDays, differenceInDays, parseISO, isToday, startOfDay, isBefore, isAfter } from "date-fns";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Dashboard = ({ user, setUser }) => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    from: addDays(startOfDay(new Date()), -7), // Include past 7 days
    to: addDays(startOfDay(new Date()), 6), // 7 days ahead
  });
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ name: "", reminder_time: "09:00" });
  const [editingCell, setEditingCell] = useState(null);
  const [cellNotes, setCellNotes] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showBin, setShowBin] = useState(false);
  const [deletedTasks, setDeletedTasks] = useState([]);
  const [expandedTasks, setExpandedTasks] = useState({});
  const notificationIntervalRef = useRef(null);

  // Generate date columns based on range
  const dateColumns = [];
  if (dateRange.from && dateRange.to) {
    const dayCount = differenceInDays(dateRange.to, dateRange.from) + 1;
    for (let i = 0; i < dayCount; i++) {
      dateColumns.push(addDays(dateRange.from, i));
    }
  }

  // Fetch tasks
  const fetchTasks = useCallback(async () => {
    try {
      const response = await fetch(`${API}/tasks`, {
        credentials: "include",
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

  // Fetch deleted tasks
  const fetchDeletedTasks = useCallback(async () => {
    try {
      const response = await fetch(`${API}/tasks/bin`, {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setDeletedTasks(data);
      }
    } catch (error) {
      console.error("Error fetching deleted tasks:", error);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchDeletedTasks();
  }, [fetchTasks, fetchDeletedTasks]);

  // Request notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Check for reminders
  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const currentTime = format(now, "HH:mm");

      tasks.forEach((task) => {
        if (task.reminder_time === currentTime) {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(`TaskFlow Reminder`, {
              body: `Time to work on: ${task.name}`,
              icon: "/favicon.ico",
            });
          }
          toast.info(`Reminder: ${task.name}`, {
            description: `It's ${currentTime} - time to work on this task!`,
            duration: 10000,
          });
        }
      });
    };

    notificationIntervalRef.current = setInterval(checkReminders, 60000);
    checkReminders();

    return () => {
      if (notificationIntervalRef.current) {
        clearInterval(notificationIntervalRef.current);
      }
    };
  }, [tasks]);

  // Add task
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
      console.error("Error creating task:", error);
      toast.error("Failed to create task");
    }
  };

  // Update daily progress with checkbox
  const handleToggleDayProgress = async (taskId, date, currentProgress) => {
    const isCompleted = currentProgress?.completed || false;
    
    try {
      const response = await fetch(`${API}/tasks/${taskId}/progress`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          date, 
          completed: !isCompleted,
          notes: currentProgress?.notes || ""
        }),
      });

      if (!response.ok) throw new Error("Failed to update progress");

      await fetchTasks();
    } catch (error) {
      console.error("Error updating progress:", error);
      toast.error("Failed to update progress");
    }
  };

  // Save cell notes
  const handleSaveCellNotes = async (taskId, date, completed) => {
    try {
      const response = await fetch(`${API}/tasks/${taskId}/progress`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          date, 
          completed,
          notes: cellNotes
        }),
      });

      if (!response.ok) throw new Error("Failed to save notes");

      await fetchTasks();
      setEditingCell(null);
      setCellNotes("");
      toast.success("Notes saved");
    } catch (error) {
      console.error("Error saving notes:", error);
      toast.error("Failed to save notes");
    }
  };

  // Soft delete task
  const handleDeleteTask = async (taskId) => {
    try {
      const response = await fetch(`${API}/tasks/${taskId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to delete task");

      await fetchTasks();
      await fetchDeletedTasks();
      setDeleteConfirm(null);
      toast.success("Task moved to bin");
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error("Failed to delete task");
    }
  };

  // Restore task from bin
  const handleRestoreTask = async (taskId) => {
    try {
      const response = await fetch(`${API}/tasks/${taskId}/restore`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to restore task");

      await fetchTasks();
      await fetchDeletedTasks();
      toast.success("Task restored");
    } catch (error) {
      console.error("Error restoring task:", error);
      toast.error("Failed to restore task");
    }
  };

  // Permanently delete task
  const handlePermanentDelete = async (taskId) => {
    try {
      const response = await fetch(`${API}/tasks/${taskId}/permanent`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to delete task");

      await fetchDeletedTasks();
      toast.success("Task permanently deleted");
    } catch (error) {
      console.error("Error deleting task:", error);
      toast.error("Failed to delete task");
    }
  };

  // Update task (name or reminder)
  const handleUpdateTask = async (taskId, field, value) => {
    try {
      const response = await fetch(`${API}/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [field]: value }),
      });

      if (!response.ok) throw new Error("Failed to update task");

      await fetchTasks();
      setEditingCell(null);
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error("Failed to update task");
    }
  };

  // Calculate progress percentage based on subtasks
  const calculateProgress = (task) => {
    const subtasks = task.subtasks || [];
    if (subtasks.length === 0) return 0;
    const completedCount = subtasks.filter((s) => s.completed).length;
    return Math.round((completedCount / subtasks.length) * 100);
  };

  // Toggle expanded task
  const toggleExpanded = (taskId) => {
    setExpandedTasks(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }));
  };

  // Logout
  const handleLogout = async () => {
    try {
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout error:", error);
    }
    navigate("/", { replace: true });
  };

  // Open subtask page in new tab
  const openSubtaskPage = (taskId) => {
    window.open(`/task/${taskId}`, "_blank");
  };

  // Check if date is overdue for a subtask
  const isOverdue = (subtask) => {
    if (subtask.completed) return false;
    const endDate = parseISO(subtask.end_date);
    return isBefore(endDate, startOfDay(new Date()));
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
        <header className="border-b border-border bg-card sticky top-0 z-10">
          <div className="container mx-auto px-4 md:px-8 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-7 w-7 text-accent" />
                <h1 className="text-xl font-bold tracking-tight font-['Manrope']">TaskFlow</h1>
              </div>

              <div className="flex items-center gap-3">
                {/* Date Range Picker */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="hidden sm:flex items-center gap-2"
                      data-testid="date-range-picker"
                    >
                      <CalendarIcon className="h-4 w-4" />
                      <span className="text-sm">
                        {dateRange.from && dateRange.to
                          ? `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d")}`
                          : "Select dates"}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="range"
                      selected={dateRange}
                      onSelect={(range) => {
                        if (range?.from) {
                          setDateRange({
                            from: range.from,
                            to: range.to || addDays(range.from, 6),
                          });
                        }
                      }}
                      numberOfMonths={2}
                      initialFocus
                      disabled={false}
                    />
                  </PopoverContent>
                </Popover>

                {/* Bin Button */}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowBin(true)}
                  className="relative"
                  data-testid="bin-btn"
                >
                  <Archive className="h-4 w-4" />
                  {deletedTasks.length > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                      {deletedTasks.length}
                    </span>
                  )}
                </Button>

                {/* User Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-9 w-9 rounded-full" data-testid="user-menu">
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
                    <DropdownMenuItem onClick={handleLogout} data-testid="logout-btn">
                      <LogOut className="mr-2 h-4 w-4" />
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
          {/* Action Bar */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold font-['Manrope']">My Tasks</h2>
              <p className="text-sm text-muted-foreground">
                {tasks.length} task{tasks.length !== 1 ? "s" : ""} • {dateColumns.length} days
              </p>
            </div>
            <Button
              onClick={() => setShowAddTask(true)}
              className="active-scale"
              data-testid="add-task-btn"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </div>

          {/* Task Grid */}
          <div className="border border-border rounded-sm bg-card overflow-hidden">
            <ScrollArea className="w-full">
              <div className="min-w-max">
                {/* Header Row */}
                <div className="flex border-b border-border bg-muted/50 sticky top-0 z-10">
                  <div className="w-8 px-2 py-3 border-r border-border"></div>
                  <div className="task-name-col min-w-[200px] w-[200px] px-4 py-3 font-medium text-sm border-r border-border">
                    Task
                  </div>
                  <div className="reminder-col min-w-[90px] w-[90px] px-3 py-3 font-medium text-sm border-r border-border flex items-center gap-1">
                    <Bell className="h-3.5 w-3.5" />
                    Reminder
                  </div>
                  <div className="progress-col min-w-[100px] w-[100px] px-3 py-3 font-medium text-sm text-center border-r border-border">
                    Progress
                  </div>
                  {dateColumns.map((date, index) => (
                    <div
                      key={index}
                      className={`date-col min-w-[90px] w-[90px] px-2 py-3 font-medium text-center border-r border-border date-header ${
                        isToday(date) ? "bg-accent/10 text-accent" : ""
                      }`}
                    >
                      <div className="text-[10px] text-muted-foreground">
                        {format(date, "EEE")}
                      </div>
                      <div className={isToday(date) ? "font-bold" : ""}>
                        {format(date, "d MMM")}
                      </div>
                    </div>
                  ))}
                  <div className="actions-col min-w-[60px] w-[60px] px-2 py-3 font-medium text-sm text-center">
                    
                  </div>
                </div>

                {/* Task Rows */}
                {tasks.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-muted-foreground">
                    <div className="text-center">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
                      <p>No tasks yet. Click "Add Task" to get started!</p>
                    </div>
                  </div>
                ) : (
                  tasks.map((task, rowIndex) => {
                    const progress = calculateProgress(task);
                    const isExpanded = expandedTasks[task.task_id];
                    const subtasks = task.subtasks || [];
                    
                    return (
                      <div key={task.task_id}>
                        {/* Main Task Row */}
                        <div
                          className="flex border-b border-border last:border-b-0 task-row animate-fade-in-up"
                          style={{ animationDelay: `${rowIndex * 50}ms` }}
                          data-testid={`task-row-${task.task_id}`}
                        >
                          {/* Expand Toggle */}
                          <div className="w-8 px-2 py-3 border-r border-border flex items-center justify-center">
                            {subtasks.length > 0 && (
                              <button
                                onClick={() => toggleExpanded(task.task_id)}
                                className="p-1 hover:bg-muted rounded"
                                data-testid={`expand-task-${task.task_id}`}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            )}
                          </div>

                          {/* Task Name */}
                          <div
                            className="task-name-col min-w-[200px] w-[200px] px-4 py-3 border-r border-border flex flex-col gap-1 editable-cell cursor-pointer group"
                            onClick={() => openSubtaskPage(task.task_id)}
                            data-testid={`task-name-${task.task_id}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">{task.name}</span>
                              <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0" />
                            </div>
                            {subtasks.length > 0 && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <span>{task.completed_subtasks || 0}/{task.subtask_count || 0} subtasks</span>
                              </div>
                            )}
                          </div>

                          {/* Reminder Time */}
                          <div className="reminder-col min-w-[90px] w-[90px] px-3 py-3 border-r border-border flex items-center">
                            {editingCell === `${task.task_id}-reminder` ? (
                              <Input
                                type="time"
                                value={editingCell === `${task.task_id}-reminder` ? cellNotes : task.reminder_time}
                                onChange={(e) => setCellNotes(e.target.value)}
                                onBlur={() => {
                                  if (cellNotes !== task.reminder_time) {
                                    handleUpdateTask(task.task_id, "reminder_time", cellNotes);
                                  } else {
                                    setEditingCell(null);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleUpdateTask(task.task_id, "reminder_time", cellNotes);
                                  } else if (e.key === "Escape") {
                                    setEditingCell(null);
                                  }
                                }}
                                className="h-7 text-xs"
                                autoFocus
                              />
                            ) : (
                              <button
                                className="reminder-badge px-2 py-1 bg-muted rounded text-muted-foreground hover:bg-accent/10 hover:text-accent transition-colors flex items-center gap-1 text-xs"
                                onClick={() => {
                                  setEditingCell(`${task.task_id}-reminder`);
                                  setCellNotes(task.reminder_time);
                                }}
                                data-testid={`reminder-${task.task_id}`}
                              >
                                <BellRing className="h-3 w-3" />
                                {task.reminder_time}
                              </button>
                            )}
                          </div>

                          {/* Progress (now adjacent to reminder) */}
                          <div className="progress-col min-w-[100px] w-[100px] px-3 py-3 border-r border-border flex flex-col items-center justify-center gap-1">
                            <span className="progress-cell font-medium text-accent text-sm">
                              {progress}%
                            </span>
                            <Progress value={progress} className="h-1.5 w-full" />
                            <span className="text-[10px] text-muted-foreground">
                              {task.completed_subtasks || 0}/{task.subtask_count || 0}
                            </span>
                          </div>

                          {/* Date Columns with Checkboxes */}
                          {dateColumns.map((date) => {
                            const dateStr = format(date, "yyyy-MM-dd");
                            const cellProgress = task.daily_progress?.[dateStr] || {};
                            const isCompleted = cellProgress.completed || false;
                            const hasNotes = cellProgress.notes && cellProgress.notes.trim();
                            const cellKey = `${task.task_id}-${dateStr}`;

                            return (
                              <div
                                key={dateStr}
                                className={`date-col min-w-[90px] w-[90px] px-2 py-2 border-r border-border flex flex-col items-center justify-center gap-1 ${
                                  isToday(date) ? "bg-accent/5" : ""
                                }`}
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1">
                                      <Checkbox
                                        checked={isCompleted}
                                        onCheckedChange={() => handleToggleDayProgress(task.task_id, dateStr, cellProgress)}
                                        className={`h-5 w-5 ${isCompleted ? "bg-success border-success" : ""}`}
                                        data-testid={`checkbox-${task.task_id}-${dateStr}`}
                                      />
                                      <button
                                        onClick={() => {
                                          setEditingCell(cellKey);
                                          setCellNotes(cellProgress.notes || "");
                                        }}
                                        className={`p-1 rounded hover:bg-muted ${hasNotes ? "text-accent" : "text-muted-foreground/30"}`}
                                        data-testid={`notes-btn-${task.task_id}-${dateStr}`}
                                      >
                                        <MessageSquare className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </TooltipTrigger>
                                  {(isCompleted || hasNotes) && (
                                    <TooltipContent>
                                      <div className="text-xs">
                                        {isCompleted && cellProgress.completed_at && (
                                          <p>Completed: {format(parseISO(cellProgress.completed_at), "MMM d, HH:mm")}</p>
                                        )}
                                        {hasNotes && <p className="mt-1">{cellProgress.notes}</p>}
                                      </div>
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              </div>
                            );
                          })}

                          {/* Actions */}
                          <div className="actions-col min-w-[60px] w-[60px] px-2 py-3 flex items-center justify-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setDeleteConfirm(task)}
                              data-testid={`delete-task-${task.task_id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Expanded Subtasks */}
                        {isExpanded && subtasks.length > 0 && (
                          <div className="bg-muted/30 border-b border-border">
                            {subtasks.map((subtask, sIndex) => {
                              const overdue = isOverdue(subtask);
                              return (
                                <div
                                  key={subtask.subtask_id}
                                  className={`flex items-center px-4 py-2 border-b border-border/50 last:border-b-0 ml-8 ${
                                    overdue ? "bg-destructive/5" : subtask.completed ? "bg-success/5" : ""
                                  }`}
                                  data-testid={`subtask-inline-${subtask.subtask_id}`}
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <Checkbox
                                      checked={subtask.completed}
                                      disabled
                                      className={`h-4 w-4 ${subtask.completed ? "bg-success border-success" : ""}`}
                                    />
                                    <span className={`text-sm ${subtask.completed ? "line-through text-muted-foreground" : ""}`}>
                                      {subtask.name}
                                    </span>
                                    <Badge variant={overdue ? "destructive" : subtask.completed ? "success" : "secondary"} className="text-[10px]">
                                      {format(parseISO(subtask.start_date), "MMM d")} - {format(parseISO(subtask.end_date), "MMM d")}
                                    </Badge>
                                    {subtask.notes && (
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <MessageSquare className="h-3.5 w-3.5 text-accent" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-xs max-w-[200px]">{subtask.notes}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                  {subtask.completed && subtask.completed_at && (
                                    <span className="text-[10px] text-muted-foreground">
                                      Completed {format(parseISO(subtask.completed_at), "MMM d")}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </main>

        {/* Add Task Dialog */}
        <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-['Manrope']">Add New Task</DialogTitle>
              <DialogDescription>
                Create a new task to track your progress.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Task Name</label>
                <Input
                  placeholder="Enter task name..."
                  value={newTask.name}
                  onChange={(e) => setNewTask({ ...newTask, name: e.target.value })}
                  data-testid="new-task-name-input"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Daily Reminder Time</label>
                <Input
                  type="time"
                  value={newTask.reminder_time}
                  onChange={(e) => setNewTask({ ...newTask, reminder_time: e.target.value })}
                  data-testid="new-task-reminder-input"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddTask(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddTask} data-testid="create-task-btn">
                Create Task
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-['Manrope']">Move to Bin</DialogTitle>
              <DialogDescription>
                Are you sure you want to move "{deleteConfirm?.name}" to bin? You can restore it later.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDeleteTask(deleteConfirm?.task_id)}
                data-testid="confirm-delete-btn"
              >
                Move to Bin
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cell Notes Dialog */}
        <Dialog open={editingCell && !editingCell.includes("-reminder")} onOpenChange={() => { setEditingCell(null); setCellNotes(""); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-['Manrope']">Add Notes</DialogTitle>
              <DialogDescription>
                Add notes for this day's progress.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Textarea
                placeholder="Enter notes about completion..."
                value={cellNotes}
                onChange={(e) => setCellNotes(e.target.value)}
                rows={4}
                data-testid="cell-notes-input"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditingCell(null); setCellNotes(""); }}>
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  if (editingCell) {
                    const [taskId, dateStr] = editingCell.split(/-(.+)/);
                    const task = tasks.find(t => t.task_id === taskId);
                    const currentProgress = task?.daily_progress?.[dateStr] || {};
                    handleSaveCellNotes(taskId, dateStr, currentProgress.completed || false);
                  }
                }}
                data-testid="save-notes-btn"
              >
                Save Notes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bin Dialog */}
        <Dialog open={showBin} onOpenChange={setShowBin}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-['Manrope'] flex items-center gap-2">
                <Archive className="h-5 w-5" />
                Bin ({deletedTasks.length} items)
              </DialogTitle>
              <DialogDescription>
                Deleted tasks are stored here. You can restore or permanently delete them.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 max-h-[400px] overflow-y-auto">
              {deletedTasks.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Bin is empty</p>
              ) : (
                <div className="space-y-2">
                  {deletedTasks.map((task) => (
                    <div
                      key={task.task_id}
                      className="flex items-center justify-between p-3 border border-border rounded-sm"
                      data-testid={`bin-task-${task.task_id}`}
                    >
                      <div>
                        <p className="font-medium">{task.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Deleted {task.deleted_at ? format(parseISO(task.deleted_at), "MMM d, yyyy HH:mm") : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestoreTask(task.task_id)}
                          data-testid={`restore-task-${task.task_id}`}
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Restore
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handlePermanentDelete(task.task_id)}
                          data-testid={`permanent-delete-${task.task_id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete Forever
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
