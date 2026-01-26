import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { toast } from "sonner";
import {
  Plus,
  Calendar as CalendarIcon,
  Bell,
  LogOut,
  Trash2,
  ExternalLink,
  CheckCircle2,
  X,
  BellRing,
} from "lucide-react";
import { format, addDays, differenceInDays, parseISO, isToday, startOfDay } from "date-fns";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const Dashboard = ({ user, setUser }) => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    from: startOfDay(new Date()),
    to: addDays(startOfDay(new Date()), 13), // 14 days by default
  });
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ name: "", reminder_time: "09:00" });
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
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

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

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
          // Show browser notification
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(`TaskFlow Reminder`, {
              body: `Time to work on: ${task.name}`,
              icon: "/favicon.ico",
            });
          }
          // Also show toast
          toast.info(`Reminder: ${task.name}`, {
            description: `It's ${currentTime} - time to work on this task!`,
            duration: 10000,
          });
        }
      });
    };

    // Check every minute
    notificationIntervalRef.current = setInterval(checkReminders, 60000);
    // Also check immediately
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

      const task = await response.json();
      setTasks([...tasks, task]);
      setNewTask({ name: "", reminder_time: "09:00" });
      setShowAddTask(false);
      toast.success("Task created successfully");
    } catch (error) {
      console.error("Error creating task:", error);
      toast.error("Failed to create task");
    }
  };

  // Update daily progress
  const handleUpdateProgress = async (taskId, date, value) => {
    try {
      const response = await fetch(`${API}/tasks/${taskId}/progress`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ date, value }),
      });

      if (!response.ok) throw new Error("Failed to update progress");

      const updatedTask = await response.json();
      setTasks(tasks.map((t) => (t.task_id === taskId ? updatedTask : t)));
      setEditingCell(null);
      setEditValue("");
    } catch (error) {
      console.error("Error updating progress:", error);
      toast.error("Failed to update progress");
    }
  };

  // Delete task
  const handleDeleteTask = async (taskId) => {
    try {
      const response = await fetch(`${API}/tasks/${taskId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to delete task");

      setTasks(tasks.filter((t) => t.task_id !== taskId));
      setDeleteConfirm(null);
      toast.success("Task deleted successfully");
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

      const updatedTask = await response.json();
      setTasks(tasks.map((t) => (t.task_id === taskId ? updatedTask : t)));
      setEditingCell(null);
      setEditValue("");
    } catch (error) {
      console.error("Error updating task:", error);
      toast.error("Failed to update task");
    }
  };

  // Calculate progress percentage
  const calculateProgress = (task) => {
    const dailyProgress = task.daily_progress || {};
    const filledDays = Object.values(dailyProgress).filter((v) => v && v.trim()).length;
    const totalDays = dateColumns.length;
    return totalDays > 0 ? Math.round((filledDays / totalDays) * 100) : 0;
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
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
                  />
                </PopoverContent>
              </Popover>

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
                <div className="task-name-col min-w-[200px] w-[200px] px-4 py-3 font-medium text-sm border-r border-border">
                  Task
                </div>
                <div className="reminder-col min-w-[100px] w-[100px] px-3 py-3 font-medium text-sm border-r border-border flex items-center gap-1">
                  <Bell className="h-3.5 w-3.5" />
                  Reminder
                </div>
                {dateColumns.map((date, index) => (
                  <div
                    key={index}
                    className={`date-col min-w-[100px] w-[100px] px-2 py-3 font-medium text-center border-r border-border date-header ${
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
                <div className="progress-col min-w-[100px] w-[100px] px-3 py-3 font-medium text-sm text-center">
                  Progress
                </div>
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
                  return (
                    <div
                      key={task.task_id}
                      className="flex border-b border-border last:border-b-0 task-row animate-fade-in-up"
                      style={{ animationDelay: `${rowIndex * 50}ms` }}
                      data-testid={`task-row-${task.task_id}`}
                    >
                      {/* Task Name */}
                      <div
                        className="task-name-col min-w-[200px] w-[200px] px-4 py-3 border-r border-border flex items-center gap-2 editable-cell cursor-pointer group"
                        onClick={() => openSubtaskPage(task.task_id)}
                        data-testid={`task-name-${task.task_id}`}
                      >
                        <span className="truncate font-medium">{task.name}</span>
                        <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0" />
                      </div>

                      {/* Reminder Time */}
                      <div className="reminder-col min-w-[100px] w-[100px] px-3 py-3 border-r border-border">
                        {editingCell === `${task.task_id}-reminder` ? (
                          <Input
                            type="time"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => {
                              if (editValue !== task.reminder_time) {
                                handleUpdateTask(task.task_id, "reminder_time", editValue);
                              } else {
                                setEditingCell(null);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleUpdateTask(task.task_id, "reminder_time", editValue);
                              } else if (e.key === "Escape") {
                                setEditingCell(null);
                              }
                            }}
                            className="h-7 text-xs"
                            autoFocus
                          />
                        ) : (
                          <button
                            className="reminder-badge px-2 py-1 bg-muted rounded text-muted-foreground hover:bg-accent/10 hover:text-accent transition-colors flex items-center gap-1"
                            onClick={() => {
                              setEditingCell(`${task.task_id}-reminder`);
                              setEditValue(task.reminder_time);
                            }}
                            data-testid={`reminder-${task.task_id}`}
                          >
                            <BellRing className="h-3 w-3" />
                            {task.reminder_time}
                          </button>
                        )}
                      </div>

                      {/* Date Columns */}
                      {dateColumns.map((date) => {
                        const dateStr = format(date, "yyyy-MM-dd");
                        const cellValue = task.daily_progress?.[dateStr] || "";
                        const cellKey = `${task.task_id}-${dateStr}`;

                        return (
                          <div
                            key={dateStr}
                            className={`date-col min-w-[100px] w-[100px] px-2 py-2 border-r border-border ${
                              isToday(date) ? "bg-accent/5" : ""
                            }`}
                          >
                            {editingCell === cellKey ? (
                              <Input
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => {
                                  if (editValue !== cellValue) {
                                    handleUpdateProgress(task.task_id, dateStr, editValue);
                                  } else {
                                    setEditingCell(null);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    handleUpdateProgress(task.task_id, dateStr, editValue);
                                  } else if (e.key === "Escape") {
                                    setEditingCell(null);
                                  }
                                }}
                                className="h-8 text-xs"
                                placeholder="Progress..."
                                autoFocus
                                data-testid={`progress-input-${task.task_id}-${dateStr}`}
                              />
                            ) : (
                              <button
                                className={`w-full h-8 px-1 text-xs rounded editable-cell truncate ${
                                  cellValue
                                    ? "bg-success/10 text-success border border-success/20"
                                    : "text-muted-foreground hover:bg-muted"
                                }`}
                                onClick={() => {
                                  setEditingCell(cellKey);
                                  setEditValue(cellValue);
                                }}
                                data-testid={`progress-cell-${task.task_id}-${dateStr}`}
                              >
                                {cellValue || "—"}
                              </button>
                            )}
                          </div>
                        );
                      })}

                      {/* Progress */}
                      <div className="progress-col min-w-[100px] w-[100px] px-3 py-3 flex flex-col items-center justify-center gap-1">
                        <span className="progress-cell font-medium text-accent">
                          {progress}%
                        </span>
                        <Progress value={progress} className="h-1.5 w-full" />
                      </div>

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
            <DialogTitle className="font-['Manrope']">Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
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
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboard;
