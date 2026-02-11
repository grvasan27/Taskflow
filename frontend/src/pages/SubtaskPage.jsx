import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTheme } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  ArrowLeft,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  MessageSquare,
  Edit2,
  Save,
  X,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { format, parseISO, startOfDay, isBefore, addDays, differenceInDays } from "date-fns";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SubtaskPage = ({ user }) => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [task, setTask] = useState(null);
  const [subtasks, setSubtasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [newSubtask, setNewSubtask] = useState({
    name: "",
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: format(addDays(new Date(), 7), "yyyy-MM-dd"),
    notes: "",
  });
  const [editingSubtask, setEditingSubtask] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [dayNotesDialog, setDayNotesDialog] = useState(null);
  const [dayNotes, setDayNotes] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [taskRes, subtasksRes] = await Promise.all([
        fetch(`${API}/tasks/${taskId}`, { credentials: "include" }),
        fetch(`${API}/tasks/${taskId}/subtasks`, { credentials: "include" }),
      ]);

      if (!taskRes.ok) {
        if (taskRes.status === 401) {
          navigate("/", { replace: true });
          return;
        }
        throw new Error("Failed to fetch task");
      }

      const taskData = await taskRes.json();
      const subtasksData = await subtasksRes.json();

      setTask(taskData);
      setSubtasks(subtasksData);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load task details");
    } finally {
      setLoading(false);
    }
  }, [taskId, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddSubtask = async () => {
    if (!newSubtask.name.trim()) {
      toast.error("Please enter a subtask name");
      return;
    }

    if (newSubtask.start_date > newSubtask.end_date) {
      toast.error("Start date must be before end date");
      return;
    }

    try {
      const response = await fetch(`${API}/tasks/${taskId}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newSubtask),
      });

      if (!response.ok) throw new Error("Failed to create subtask");

      await fetchData();
      setNewSubtask({
        name: "",
        start_date: format(new Date(), "yyyy-MM-dd"),
        end_date: format(addDays(new Date(), 7), "yyyy-MM-dd"),
        notes: "",
      });
      setShowAddSubtask(false);
      toast.success("Subtask created successfully");
    } catch (error) {
      toast.error("Failed to create subtask");
    }
  };

  const handleUpdateSubtask = async (subtaskId, updates) => {
    try {
      const response = await fetch(`${API}/subtasks/${subtaskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error("Failed to update subtask");

      await fetchData();
      setEditingSubtask(null);
      setEditForm({});
      toast.success("Subtask updated");
    } catch (error) {
      toast.error("Failed to update subtask");
    }
  };

  const handleToggleDayCompletion = async (subtaskId, date, currentData) => {
    try {
      const response = await fetch(`${API}/subtasks/${subtaskId}/day/${date}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          date,
          completed: !currentData?.completed,
          notes: currentData?.notes || "",
        }),
      });

      if (!response.ok) throw new Error("Failed to update");
      await fetchData();
    } catch (error) {
      toast.error("Failed to update day completion");
    }
  };

  const handleSaveDayNotes = async () => {
    if (!dayNotesDialog) return;

    try {
      const response = await fetch(`${API}/subtasks/${dayNotesDialog.subtaskId}/day/${dayNotesDialog.date}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          date: dayNotesDialog.date,
          completed: dayNotesDialog.completed,
          notes: dayNotes,
        }),
      });

      if (!response.ok) throw new Error("Failed to save notes");
      await fetchData();
      setDayNotesDialog(null);
      setDayNotes("");
      toast.success("Notes saved");
    } catch (error) {
      toast.error("Failed to save notes");
    }
  };

  const handleDeleteSubtask = async (subtaskId) => {
    try {
      await fetch(`${API}/subtasks/${subtaskId}`, {
        method: "DELETE",
        credentials: "include",
      });

      await fetchData();
      setDeleteConfirm(null);
      toast.success("Subtask deleted");
    } catch (error) {
      toast.error("Failed to delete subtask");
    }
  };

  // Calculate overall progress
  const calculateProgress = () => {
    let totalDays = 0;
    let completedDays = 0;

    subtasks.forEach((subtask) => {
      const dayCompletions = subtask.day_completions || {};
      const start = parseISO(subtask.start_date);
      const end = parseISO(subtask.end_date);
      const days = differenceInDays(end, start) + 1;
      totalDays += days;
      completedDays += Object.values(dayCompletions).filter((d) => d.completed).length;
    });

    return totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;
  };

  // Get days for a subtask
  const getSubtaskDays = (subtask) => {
    const days = [];
    const start = parseISO(subtask.start_date);
    const end = parseISO(subtask.end_date);
    let current = start;
    while (current <= end) {
      days.push(format(current, "yyyy-MM-dd"));
      current = addDays(current, 1);
    }
    return days;
  };

  // Check if day is overdue
  const isDayOverdue = (dateStr, completed) => {
    if (completed) return false;
    return isBefore(parseISO(dateStr), startOfDay(new Date()));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Task not found</p>
          <Button onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
        </div>
      </div>
    );
  }

  const completionPercentage = calculateProgress();

  return (
    <div className="min-h-screen bg-background" data-testid="subtask-page">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => window.close()} className="flex-shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold tracking-tight font-['Manrope'] truncate">{task.name}</h1>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Reminder: {task.reminder_time}
                </span>
              </div>
            </div>
            
            {/* Theme Toggle */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  {theme === "light" ? <Sun className="h-4 w-4" /> : theme === "dark" ? <Moon className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setTheme("light")}><Sun className="mr-2 h-4 w-4" /> Light</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}><Moon className="mr-2 h-4 w-4" /> Dark</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")}><Monitor className="mr-2 h-4 w-4" /> System</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-accent" />
              <span className="font-medium font-['Manrope']">TaskFlow</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 md:px-8 py-6 max-w-4xl">
        {/* Progress Overview */}
        <div className="mb-8 p-6 border border-border rounded-sm bg-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold font-['Manrope']">Overall Progress</h2>
            <span className="text-2xl font-bold text-accent">{completionPercentage}%</span>
          </div>
          <Progress value={completionPercentage} className="h-3" />
          <p className="text-sm text-muted-foreground mt-2">
            Track completion day by day
          </p>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold font-['Manrope']">Subtasks</h2>
          <Button onClick={() => setShowAddSubtask(true)} className="active-scale">
            <Plus className="h-4 w-4 mr-2" /> Add Subtask
          </Button>
        </div>

        {/* Subtasks List */}
        {subtasks.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-sm">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>No subtasks yet. Click "Add Subtask" to break down this task!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {subtasks.map((subtask) => {
              const days = getSubtaskDays(subtask);
              const dayCompletions = subtask.day_completions || {};
              const completedCount = Object.values(dayCompletions).filter((d) => d.completed).length;
              const isEditing = editingSubtask === subtask.subtask_id;

              return (
                <div key={subtask.subtask_id} className="border border-border rounded-sm bg-card overflow-hidden">
                  {/* Subtask Header */}
                  <div className="p-4 border-b border-border bg-muted/30">
                    {isEditing ? (
                      <div className="space-y-3">
                        <Input value={editForm.name || ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Subtask name" />
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-muted-foreground">Start Date</label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-start text-left font-normal text-sm">
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {editForm.start_date ? format(parseISO(editForm.start_date), "MMM d, yyyy") : "Pick date"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar mode="single" selected={editForm.start_date ? parseISO(editForm.start_date) : undefined} onSelect={(date) => date && setEditForm({ ...editForm, start_date: format(date, "yyyy-MM-dd") })} />
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">End Date</label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-start text-left font-normal text-sm">
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {editForm.end_date ? format(parseISO(editForm.end_date), "MMM d, yyyy") : "Pick date"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar mode="single" selected={editForm.end_date ? parseISO(editForm.end_date) : undefined} onSelect={(date) => date && setEditForm({ ...editForm, end_date: format(date, "yyyy-MM-dd") })} />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" size="sm" onClick={() => { setEditingSubtask(null); setEditForm({}); }}>
                            <X className="h-4 w-4 mr-1" /> Cancel
                          </Button>
                          <Button size="sm" onClick={() => handleUpdateSubtask(subtask.subtask_id, editForm)}>
                            <Save className="h-4 w-4 mr-1" /> Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium">{subtask.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-[10px]">
                              {format(parseISO(subtask.start_date), "MMM d")} - {format(parseISO(subtask.end_date), "MMM d")}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {completedCount}/{days.length} days completed
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingSubtask(subtask.subtask_id); setEditForm({ name: subtask.name, start_date: subtask.start_date, end_date: subtask.end_date }); }}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => setDeleteConfirm(subtask)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Day-by-Day Completion */}
                  {!isEditing && (
                    <div className="p-4">
                      <div className="grid grid-cols-7 gap-2">
                        {days.map((dateStr) => {
                          const dayData = dayCompletions[dateStr] || {};
                          const completed = dayData.completed || false;
                          const overdue = isDayOverdue(dateStr, completed);
                          const hasNotes = dayData.notes && dayData.notes.trim();

                          return (
                            <div
                              key={dateStr}
                              className={`relative p-2 rounded-sm border text-center ${
                                completed ? "bg-success/10 border-success/30" : overdue ? "bg-destructive/10 border-destructive/30" : "border-border"
                              }`}
                            >
                              <p className="text-[10px] text-muted-foreground">{format(parseISO(dateStr), "EEE")}</p>
                              <p className={`text-sm font-medium ${completed ? "text-success" : overdue ? "text-destructive" : ""}`}>
                                {format(parseISO(dateStr), "d")}
                              </p>
                              <div className="flex items-center justify-center gap-1 mt-1">
                                <Checkbox
                                  checked={completed}
                                  onCheckedChange={() => handleToggleDayCompletion(subtask.subtask_id, dateStr, dayData)}
                                  className={`h-4 w-4 ${completed ? "bg-success border-success" : ""}`}
                                />
                                <button
                                  onClick={() => {
                                    setDayNotesDialog({ subtaskId: subtask.subtask_id, date: dateStr, completed });
                                    setDayNotes(dayData.notes || "");
                                  }}
                                  className={`p-0.5 rounded ${hasNotes ? "text-accent" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
                                >
                                  <MessageSquare className="h-3 w-3" />
                                </button>
                              </div>
                              {completed && dayData.completed_at && (
                                <p className="text-[8px] text-success mt-1">✓</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Add Subtask Dialog */}
      <Dialog open={showAddSubtask} onOpenChange={setShowAddSubtask}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Subtask</DialogTitle>
            <DialogDescription>Break down "{task.name}" into smaller subtasks with date ranges.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Subtask Name</label>
              <Input placeholder="Enter subtask name..." value={newSubtask.name} onChange={(e) => setNewSubtask({ ...newSubtask, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newSubtask.start_date ? format(parseISO(newSubtask.start_date), "PPP") : "Pick start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={newSubtask.start_date ? parseISO(newSubtask.start_date) : undefined} onSelect={(date) => date && setNewSubtask({ ...newSubtask, start_date: format(date, "yyyy-MM-dd") })} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newSubtask.end_date ? format(parseISO(newSubtask.end_date), "PPP") : "Pick end date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={newSubtask.end_date ? parseISO(newSubtask.end_date) : undefined} onSelect={(date) => date && setNewSubtask({ ...newSubtask, end_date: format(date, "yyyy-MM-dd") })} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes (optional)</label>
              <Textarea placeholder="Add any notes..." value={newSubtask.notes} onChange={(e) => setNewSubtask({ ...newSubtask, notes: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddSubtask(false)}>Cancel</Button>
            <Button onClick={handleAddSubtask}>Create Subtask</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Day Notes Dialog */}
      <Dialog open={!!dayNotesDialog} onOpenChange={() => { setDayNotesDialog(null); setDayNotes(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Day Notes</DialogTitle>
            <DialogDescription>Add notes for {dayNotesDialog ? format(parseISO(dayNotesDialog.date), "MMMM d, yyyy") : ""}</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea placeholder="Enter notes for this day..." value={dayNotes} onChange={(e) => setDayNotes(e.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDayNotesDialog(null); setDayNotes(""); }}>Cancel</Button>
            <Button onClick={handleSaveDayNotes}>Save Notes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Subtask</DialogTitle>
            <DialogDescription>Are you sure you want to delete "{deleteConfirm?.name}"?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleDeleteSubtask(deleteConfirm?.subtask_id)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubtaskPage;
