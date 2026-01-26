import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  Circle,
  Clock,
  ExternalLink,
} from "lucide-react";
import { format, parseISO, startOfDay } from "date-fns";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SubtaskPage = ({ user }) => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [subtasks, setSubtasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [newSubtask, setNewSubtask] = useState({
    name: "",
    date: format(new Date(), "yyyy-MM-dd"),
  });
  const [editingSubtask, setEditingSubtask] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Fetch task and subtasks
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

  // Add subtask
  const handleAddSubtask = async () => {
    if (!newSubtask.name.trim()) {
      toast.error("Please enter a subtask name");
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

      const subtask = await response.json();
      setSubtasks([...subtasks, subtask]);
      setNewSubtask({ name: "", date: format(new Date(), "yyyy-MM-dd") });
      setShowAddSubtask(false);
      toast.success("Subtask created successfully");
    } catch (error) {
      console.error("Error creating subtask:", error);
      toast.error("Failed to create subtask");
    }
  };

  // Update subtask
  const handleUpdateSubtask = async (subtaskId, updates) => {
    try {
      const response = await fetch(`${API}/subtasks/${subtaskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error("Failed to update subtask");

      const updatedSubtask = await response.json();
      setSubtasks(subtasks.map((s) => (s.subtask_id === subtaskId ? updatedSubtask : s)));
      setEditingSubtask(null);
      setEditValue("");
    } catch (error) {
      console.error("Error updating subtask:", error);
      toast.error("Failed to update subtask");
    }
  };

  // Toggle subtask completion
  const handleToggleComplete = async (subtask) => {
    await handleUpdateSubtask(subtask.subtask_id, { completed: !subtask.completed });
  };

  // Delete subtask
  const handleDeleteSubtask = async (subtaskId) => {
    try {
      const response = await fetch(`${API}/subtasks/${subtaskId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to delete subtask");

      setSubtasks(subtasks.filter((s) => s.subtask_id !== subtaskId));
      setDeleteConfirm(null);
      toast.success("Subtask deleted successfully");
    } catch (error) {
      console.error("Error deleting subtask:", error);
      toast.error("Failed to delete subtask");
    }
  };

  // Calculate completion percentage
  const completionPercentage =
    subtasks.length > 0
      ? Math.round((subtasks.filter((s) => s.completed).length / subtasks.length) * 100)
      : 0;

  // Group subtasks by date
  const groupedSubtasks = subtasks.reduce((acc, subtask) => {
    const date = subtask.date;
    if (!acc[date]) acc[date] = [];
    acc[date].push(subtask);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedSubtasks).sort();

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

  return (
    <div className="min-h-screen bg-background" data-testid="subtask-page">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 md:px-8 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.close()}
              className="flex-shrink-0"
              data-testid="back-btn"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold tracking-tight font-['Manrope'] truncate">
                {task.name}
              </h1>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Reminder: {task.reminder_time}
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {subtasks.filter((s) => s.completed).length}/{subtasks.length} completed
                </span>
              </div>
            </div>
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
            {subtasks.filter((s) => s.completed).length} of {subtasks.length} subtasks completed
          </p>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold font-['Manrope']">Subtasks</h2>
          <Button
            onClick={() => setShowAddSubtask(true)}
            className="active-scale"
            data-testid="add-subtask-btn"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Subtask
          </Button>
        </div>

        {/* Subtasks List */}
        {subtasks.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-sm">
            <Circle className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>No subtasks yet. Click "Add Subtask" to break down this task!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedDates.map((date) => (
              <div key={date} className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <CalendarIcon className="h-4 w-4" />
                  {format(parseISO(date), "EEEE, MMMM d, yyyy")}
                </div>
                <div className="space-y-2">
                  {groupedSubtasks[date].map((subtask, index) => (
                    <div
                      key={subtask.subtask_id}
                      className={`flex items-center gap-3 p-4 border border-border rounded-sm bg-card hover-lift transition-all animate-fade-in-up ${
                        subtask.completed ? "bg-success/5 border-success/20" : ""
                      }`}
                      style={{ animationDelay: `${index * 50}ms` }}
                      data-testid={`subtask-${subtask.subtask_id}`}
                    >
                      <Checkbox
                        checked={subtask.completed}
                        onCheckedChange={() => handleToggleComplete(subtask)}
                        className="h-5 w-5"
                        data-testid={`subtask-checkbox-${subtask.subtask_id}`}
                      />
                      
                      {editingSubtask === subtask.subtask_id ? (
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => {
                            if (editValue !== subtask.name && editValue.trim()) {
                              handleUpdateSubtask(subtask.subtask_id, { name: editValue });
                            } else {
                              setEditingSubtask(null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editValue.trim()) {
                              handleUpdateSubtask(subtask.subtask_id, { name: editValue });
                            } else if (e.key === "Escape") {
                              setEditingSubtask(null);
                            }
                          }}
                          className="flex-1"
                          autoFocus
                        />
                      ) : (
                        <button
                          className={`flex-1 text-left transition-colors ${
                            subtask.completed
                              ? "line-through text-muted-foreground"
                              : "hover:text-accent"
                          }`}
                          onClick={() => {
                            setEditingSubtask(subtask.subtask_id);
                            setEditValue(subtask.name);
                          }}
                          data-testid={`subtask-name-${subtask.subtask_id}`}
                        >
                          {subtask.name}
                        </button>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
                        onClick={() => setDeleteConfirm(subtask)}
                        data-testid={`delete-subtask-${subtask.subtask_id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add Subtask Dialog */}
      <Dialog open={showAddSubtask} onOpenChange={setShowAddSubtask}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-['Manrope']">Add New Subtask</DialogTitle>
            <DialogDescription>
              Break down "{task.name}" into smaller subtasks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Subtask Name</label>
              <Input
                placeholder="Enter subtask name..."
                value={newSubtask.name}
                onChange={(e) => setNewSubtask({ ...newSubtask, name: e.target.value })}
                data-testid="new-subtask-name-input"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    data-testid="new-subtask-date-picker"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newSubtask.date
                      ? format(parseISO(newSubtask.date), "PPP")
                      : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newSubtask.date ? parseISO(newSubtask.date) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setNewSubtask({ ...newSubtask, date: format(date, "yyyy-MM-dd") });
                      }
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddSubtask(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddSubtask} data-testid="create-subtask-btn">
              Create Subtask
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-['Manrope']">Delete Subtask</DialogTitle>
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
              onClick={() => handleDeleteSubtask(deleteConfirm?.subtask_id)}
              data-testid="confirm-delete-subtask-btn"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubtaskPage;
