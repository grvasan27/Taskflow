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
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Download,
  RefreshCw,
  Link,
  Unlink,
} from "lucide-react";
import { format, addDays, differenceInDays, parseISO, isToday, startOfDay, isBefore, isAfter, isWithinInterval } from "date-fns";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CELL_WIDTH = 50; // Width of each date column in pixels

const Dashboard = ({ user, setUser }) => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(addDays(startOfDay(new Date()), -14));
  const [daysToShow, setDaysToShow] = useState(42); // 6 weeks
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ name: "", reminder_time: "09:00" });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showBin, setShowBin] = useState(false);
  const [deletedTasks, setDeletedTasks] = useState([]);
  const [notesDialog, setNotesDialog] = useState(null);
  const [notesText, setNotesText] = useState("");
  const [calendarStatus, setCalendarStatus] = useState({ connected: false });
  const [syncing, setSyncing] = useState(false);
  const scrollContainerRef = useRef(null);
  const notificationIntervalRef = useRef(null);

  // Generate date columns
  const dateColumns = [];
  for (let i = 0; i < daysToShow; i++) {
    dateColumns.push(addDays(startDate, i));
  }

  // Scroll handlers for infinite scroll
  const scrollLeft = () => {
    setStartDate(prev => addDays(prev, -7));
  };

  const scrollRight = () => {
    setStartDate(prev => addDays(prev, 7));
  };

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

  // Export to CSV
  const handleExportCSV = async () => {
    try {
      const response = await fetch(`${API}/tasks/export/csv`, {
        credentials: "include",
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
      console.error("Export error:", error);
      toast.error("Failed to export CSV");
    }
  };

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

  // Toggle subtask completion
  const handleToggleSubtask = async (subtask) => {
    try {
      const response = await fetch(`${API}/subtasks/${subtask.subtask_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ completed: !subtask.completed }),
      });

      if (!response.ok) throw new Error("Failed to update subtask");

      await fetchTasks();
    } catch (error) {
      console.error("Error updating subtask:", error);
      toast.error("Failed to update subtask");
    }
  };

  // Save subtask notes
  const handleSaveNotes = async () => {
    if (!notesDialog) return;
    
    try {
      const response = await fetch(`${API}/subtasks/${notesDialog.subtask_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notes: notesText }),
      });

      if (!response.ok) throw new Error("Failed to save notes");

      await fetchTasks();
      setNotesDialog(null);
      setNotesText("");
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

  // Calculate progress percentage based on subtasks
  const calculateProgress = (task) => {
    const subtasks = task.subtasks || [];
    if (subtasks.length === 0) return 0;
    const completedCount = subtasks.filter((s) => s.completed).length;
    return Math.round((completedCount / subtasks.length) * 100);
  };

  // Check if date is within subtask range
  const isDateInRange = (date, subtask) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return dateStr >= subtask.start_date && dateStr <= subtask.end_date;
  };

  // Get bar position info for Gantt
  const getBarInfo = (subtask, dateColumns) => {
    const startDateObj = parseISO(subtask.start_date);
    const endDateObj = parseISO(subtask.end_date);
    
    let startIndex = -1;
    let endIndex = -1;
    
    dateColumns.forEach((date, index) => {
      const dateStr = format(date, "yyyy-MM-dd");
      if (dateStr === subtask.start_date) startIndex = index;
      if (dateStr === subtask.end_date) endIndex = index;
    });
    
    // Check if bar is partially visible
    if (startIndex === -1 && endIndex === -1) {
      // Check if the range spans across visible dates
      const firstDate = dateColumns[0];
      const lastDate = dateColumns[dateColumns.length - 1];
      
      if (isBefore(startDateObj, firstDate) && isAfter(endDateObj, lastDate)) {
        return { startIndex: 0, endIndex: dateColumns.length - 1, partial: 'both' };
      }
      return null;
    }
    
    if (startIndex === -1) {
      startIndex = 0;
    }
    if (endIndex === -1) {
      endIndex = dateColumns.length - 1;
    }
    
    return { startIndex, endIndex, partial: null };
  };

  // Check if overdue
  const isOverdue = (subtask) => {
    if (subtask.completed) return false;
    const endDate = parseISO(subtask.end_date);
    return isBefore(endDate, startOfDay(new Date()));
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

  // Go to today
  const goToToday = () => {
    setStartDate(addDays(startOfDay(new Date()), -14));
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

              <div className="flex items-center gap-3">
                {/* Navigation Controls */}
                <div className="flex items-center gap-1 bg-muted rounded-md p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={scrollLeft}
                    data-testid="scroll-left-btn"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={goToToday}
                    data-testid="today-btn"
                  >
                    Today
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={scrollRight}
                    data-testid="scroll-right-btn"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Date Range Display */}
                <div className="hidden sm:block text-sm text-muted-foreground">
                  {format(startDate, "MMM d")} - {format(addDays(startDate, daysToShow - 1), "MMM d, yyyy")}
                </div>

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

                {/* Export CSV Button */}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleExportCSV}
                  data-testid="export-csv-btn"
                >
                  <Download className="h-4 w-4" />
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
              <h2 className="text-2xl font-semibold font-['Manrope']">Gantt View</h2>
              <p className="text-sm text-muted-foreground">
                {tasks.length} task{tasks.length !== 1 ? "s" : ""} • Click subtask bar to toggle completion
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

          {/* Gantt Chart */}
          <div className="border border-border rounded-sm bg-card overflow-hidden">
            <div className="flex">
              {/* Fixed Left Panel */}
              <div className="flex-shrink-0 border-r border-border bg-card z-10">
                {/* Header */}
                <div className="flex border-b border-border bg-muted/50 h-12">
                  <div className="w-[200px] px-4 py-3 font-medium text-sm flex items-center">Task / Subtask</div>
                  <div className="w-[70px] px-2 py-3 font-medium text-sm flex items-center justify-center">
                    <Bell className="h-3.5 w-3.5 mr-1" />
                    Time
                  </div>
                  <div className="w-[80px] px-2 py-3 font-medium text-sm flex items-center justify-center">Progress</div>
                </div>

                {/* Task Rows */}
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
                    
                    return (
                      <div key={task.task_id}>
                        {/* Task Row */}
                        <div className="flex border-b border-border h-12 bg-muted/30" data-testid={`task-row-${task.task_id}`}>
                          <div
                            className="w-[200px] px-4 py-2 flex items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => openSubtaskPage(task.task_id)}
                          >
                            <span className="font-medium truncate text-sm">{task.name}</span>
                            <ExternalLink className="h-3 w-3 opacity-40 flex-shrink-0" />
                          </div>
                          <div className="w-[70px] px-2 py-2 flex items-center justify-center">
                            <span className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{task.reminder_time}</span>
                          </div>
                          <div className="w-[80px] px-2 py-2 flex flex-col items-center justify-center gap-0.5">
                            <span className="text-xs font-medium text-accent">{progress}%</span>
                            <Progress value={progress} className="h-1 w-full" />
                          </div>
                        </div>

                        {/* Subtask Rows */}
                        {subtasks.map((subtask) => {
                          const overdue = isOverdue(subtask);
                          return (
                            <div
                              key={subtask.subtask_id}
                              className="flex border-b border-border/50 h-10"
                              data-testid={`subtask-row-${subtask.subtask_id}`}
                            >
                              <div className="w-[200px] px-4 py-2 flex items-center gap-2 pl-8">
                                <Checkbox
                                  checked={subtask.completed}
                                  onCheckedChange={() => handleToggleSubtask(subtask)}
                                  className={`h-4 w-4 flex-shrink-0 ${subtask.completed ? "bg-success border-success" : ""}`}
                                  data-testid={`subtask-checkbox-${subtask.subtask_id}`}
                                />
                                <span className={`text-sm truncate ${subtask.completed ? "line-through text-muted-foreground" : ""} ${overdue ? "text-destructive" : ""}`}>
                                  {subtask.name}
                                </span>
                                {subtask.notes && (
                                  <MessageSquare className="h-3 w-3 text-accent flex-shrink-0" />
                                )}
                              </div>
                              <div className="w-[70px] px-2 py-2 flex items-center justify-center">
                                <button
                                  onClick={() => {
                                    setNotesDialog(subtask);
                                    setNotesText(subtask.notes || "");
                                  }}
                                  className="text-muted-foreground hover:text-accent"
                                  data-testid={`notes-btn-${subtask.subtask_id}`}
                                >
                                  <MessageSquare className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <div className="w-[80px] px-2 py-2 flex items-center justify-center">
                                <span className={`text-[10px] ${overdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                  {format(parseISO(subtask.start_date), "MMM d")}
                                </span>
                              </div>
                            </div>
                          );
                        })}
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
                        <div
                          key={index}
                          className={`flex-shrink-0 flex flex-col items-center justify-center border-r border-border/50 ${
                            isCurrentDay ? "bg-accent/10" : ""
                          }`}
                          style={{ width: CELL_WIDTH }}
                        >
                          <span className="text-[9px] text-muted-foreground uppercase">{format(date, "EEE")}</span>
                          <span className={`text-xs ${isCurrentDay ? "font-bold text-accent" : ""}`}>{format(date, "d")}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Task/Subtask Gantt Bars */}
                  {tasks.map((task) => {
                    const subtasks = task.subtasks || [];
                    
                    return (
                      <div key={task.task_id}>
                        {/* Task Row - empty cells */}
                        <div className="flex border-b border-border h-12 bg-muted/30">
                          {dateColumns.map((date, index) => {
                            const isCurrentDay = isToday(date);
                            return (
                              <div
                                key={index}
                                className={`flex-shrink-0 border-r border-border/30 ${isCurrentDay ? "bg-accent/5" : ""}`}
                                style={{ width: CELL_WIDTH }}
                              />
                            );
                          })}
                        </div>

                        {/* Subtask Rows with Gantt Bars */}
                        {subtasks.map((subtask) => {
                          const barInfo = getBarInfo(subtask, dateColumns);
                          const overdue = isOverdue(subtask);
                          
                          return (
                            <div key={subtask.subtask_id} className="flex border-b border-border/50 h-10 relative">
                              {dateColumns.map((date, index) => {
                                const isCurrentDay = isToday(date);
                                return (
                                  <div
                                    key={index}
                                    className={`flex-shrink-0 border-r border-border/30 ${isCurrentDay ? "bg-accent/5" : ""}`}
                                    style={{ width: CELL_WIDTH }}
                                  />
                                );
                              })}
                              
                              {/* Gantt Bar */}
                              {barInfo && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      className={`absolute top-1/2 -translate-y-1/2 h-6 rounded-sm transition-all cursor-pointer hover:opacity-80 ${
                                        subtask.completed
                                          ? "bg-success/80"
                                          : overdue
                                          ? "bg-destructive/80"
                                          : "bg-accent/70"
                                      }`}
                                      style={{
                                        left: barInfo.startIndex * CELL_WIDTH + 4,
                                        width: (barInfo.endIndex - barInfo.startIndex + 1) * CELL_WIDTH - 8,
                                      }}
                                      onClick={() => handleToggleSubtask(subtask)}
                                      data-testid={`gantt-bar-${subtask.subtask_id}`}
                                    >
                                      <span className="text-[10px] text-white font-medium px-2 truncate block">
                                        {subtask.name}
                                      </span>
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="text-xs">
                                      <p className="font-medium">{subtask.name}</p>
                                      <p className="text-muted-foreground">
                                        {format(parseISO(subtask.start_date), "MMM d")} - {format(parseISO(subtask.end_date), "MMM d")}
                                      </p>
                                      <p className={subtask.completed ? "text-success" : overdue ? "text-destructive" : ""}>
                                        {subtask.completed ? "✓ Completed" : overdue ? "⚠ Overdue" : "In Progress"}
                                      </p>
                                      {subtask.notes && <p className="mt-1 max-w-[200px]">{subtask.notes}</p>}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-accent/70"></div>
              <span>In Progress</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-success/80"></div>
              <span>Completed</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-destructive/80"></div>
              <span>Overdue</span>
            </div>
          </div>
        </main>

        {/* Add Task Dialog */}
        <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-['Manrope']">Add New Task</DialogTitle>
              <DialogDescription>
                Create a new task, then add subtasks with date ranges.
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
                Are you sure you want to move "{deleteConfirm?.name}" to bin?
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

        {/* Notes Dialog */}
        <Dialog open={!!notesDialog} onOpenChange={() => { setNotesDialog(null); setNotesText(""); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-['Manrope']">Subtask Notes</DialogTitle>
              <DialogDescription>
                Add completion notes for "{notesDialog?.name}"
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Textarea
                placeholder="Enter notes about this subtask..."
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                rows={5}
                data-testid="subtask-notes-input"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setNotesDialog(null); setNotesText(""); }}>
                Cancel
              </Button>
              <Button onClick={handleSaveNotes} data-testid="save-notes-btn">
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
                Restore or permanently delete tasks.
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
                          Deleted {task.deleted_at ? format(parseISO(task.deleted_at), "MMM d, yyyy") : ""}
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
