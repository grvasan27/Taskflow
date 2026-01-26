import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  MessageSquare,
  Edit2,
  Save,
  X,
} from "lucide-react";
import { format, parseISO, startOfDay, isBefore, addDays } from "date-fns";

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
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: format(addDays(new Date(), 7), "yyyy-MM-dd"),
    notes: "",
  });
  const [editingSubtask, setEditingSubtask] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [notesDialog, setNotesDialog] = useState(null);

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

      const subtask = await response.json();
      setSubtasks([...subtasks, subtask]);
      setNewSubtask({
        name: "",
        start_date: format(new Date(), "yyyy-MM-dd"),
        end_date: format(addDays(new Date(), 7), "yyyy-MM-dd"),
        notes: "",
      });
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
      setEditForm({});
      toast.success("Subtask updated");
    } catch (error) {
      console.error("Error updating subtask:", error);
      toast.error("Failed to update subtask");
    }
  };

  // Toggle subtask completion
  const handleToggleComplete = async (subtask) => {
    await handleUpdateSubtask(subtask.subtask_id, { completed: !subtask.completed });
  };

  // Save notes
  const handleSaveNotes = async (subtaskId, notes) => {
    try {
      const response = await fetch(`${API}/subtasks/${subtaskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notes }),
      });

      if (!response.ok) throw new Error("Failed to save notes");

      const updatedSubtask = await response.json();
      setSubtasks(subtasks.map((s) => (s.subtask_id === subtaskId ? updatedSubtask : s)));
      setNotesDialog(null);
      toast.success("Notes saved");
    } catch (error) {
      console.error("Error saving notes:", error);
      toast.error("Failed to save notes");
    }
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

  // Check if overdue
  const isOverdue = (subtask) => {
    if (subtask.completed) return false;
    const endDate = parseISO(subtask.end_date);
    return isBefore(endDate, startOfDay(new Date()));
  };

  // Calculate completion percentage
  const completionPercentage =
    subtasks.length > 0
      ? Math.round((subtasks.filter((s) => s.completed).length / subtasks.length) * 100)
      : 0;

  // Group subtasks by status
  const overdueSubtasks = subtasks.filter((s) => isOverdue(s));
  const activeSubtasks = subtasks.filter((s) => !s.completed && !isOverdue(s));
  const completedSubtasks = subtasks.filter((s) => s.completed);

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

  const SubtaskItem = ({ subtask, index }) => {
    const overdue = isOverdue(subtask);
    const isEditing = editingSubtask === subtask.subtask_id;

    return (
      <div
        className={`p-4 border rounded-sm transition-all animate-fade-in-up ${
          overdue
            ? "border-destructive/50 bg-destructive/5"
            : subtask.completed
            ? "border-success/50 bg-success/5"
            : "border-border bg-card"
        } hover-lift`}
        style={{ animationDelay: `${index * 50}ms` }}
        data-testid={`subtask-${subtask.subtask_id}`}
      >
        {isEditing ? (
          <div className="space-y-3">
            <Input
              value={editForm.name || ""}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="Subtask name"
              data-testid={`edit-subtask-name-${subtask.subtask_id}`}
            />
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
                    <Calendar
                      mode="single"
                      selected={editForm.start_date ? parseISO(editForm.start_date) : undefined}
                      onSelect={(date) => date && setEditForm({ ...editForm, start_date: format(date, "yyyy-MM-dd") })}
                      initialFocus
                    />
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
                    <Calendar
                      mode="single"
                      selected={editForm.end_date ? parseISO(editForm.end_date) : undefined}
                      onSelect={(date) => date && setEditForm({ ...editForm, end_date: format(date, "yyyy-MM-dd") })}
                      initialFocus
                    />
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
          <div className="flex items-start gap-3">
            <Checkbox
              checked={subtask.completed}
              onCheckedChange={() => handleToggleComplete(subtask)}
              className={`h-5 w-5 mt-0.5 ${subtask.completed ? "bg-success border-success" : ""}`}
              data-testid={`subtask-checkbox-${subtask.subtask_id}`}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`font-medium ${subtask.completed ? "line-through text-muted-foreground" : ""}`}
                >
                  {subtask.name}
                </span>
                <Badge
                  variant={overdue ? "destructive" : subtask.completed ? "success" : "secondary"}
                  className="text-[10px]"
                >
                  {format(parseISO(subtask.start_date), "MMM d")} - {format(parseISO(subtask.end_date), "MMM d")}
                </Badge>
                {overdue && <Badge variant="destructive" className="text-[10px]">OVERDUE</Badge>}
              </div>
              
              {subtask.notes && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{subtask.notes}</p>
              )}
              
              {subtask.completed && subtask.completed_at && (
                <p className="text-xs text-success mt-1">
                  ✓ Completed on {format(parseISO(subtask.completed_at), "MMM d, yyyy 'at' HH:mm")}
                </p>
              )}
            </div>
            
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setNotesDialog(subtask)}
                data-testid={`notes-btn-${subtask.subtask_id}`}
              >
                <MessageSquare className={`h-4 w-4 ${subtask.notes ? "text-accent" : "text-muted-foreground"}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setEditingSubtask(subtask.subtask_id);
                  setEditForm({
                    name: subtask.name,
                    start_date: subtask.start_date,
                    end_date: subtask.end_date,
                  });
                }}
                data-testid={`edit-subtask-${subtask.subtask_id}`}
              >
                <Edit2 className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:text-destructive"
                onClick={() => setDeleteConfirm(subtask)}
                data-testid={`delete-subtask-${subtask.subtask_id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

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
          <div className="flex gap-4 mt-3 text-sm">
            <span className="text-muted-foreground">
              {subtasks.filter((s) => s.completed).length} of {subtasks.length} subtasks completed
            </span>
            {overdueSubtasks.length > 0 && (
              <span className="text-destructive font-medium">
                {overdueSubtasks.length} overdue
              </span>
            )}
          </div>
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
            {/* Overdue Section */}
            {overdueSubtasks.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-destructive mb-3 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-destructive"></span>
                  Overdue ({overdueSubtasks.length})
                </h3>
                <div className="space-y-2">
                  {overdueSubtasks.map((subtask, index) => (
                    <SubtaskItem key={subtask.subtask_id} subtask={subtask} index={index} />
                  ))}
                </div>
              </div>
            )}

            {/* Active Section */}
            {activeSubtasks.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-accent"></span>
                  Active ({activeSubtasks.length})
                </h3>
                <div className="space-y-2">
                  {activeSubtasks.map((subtask, index) => (
                    <SubtaskItem key={subtask.subtask_id} subtask={subtask} index={index} />
                  ))}
                </div>
              </div>
            )}

            {/* Completed Section */}
            {completedSubtasks.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-success mb-3 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-success"></span>
                  Completed ({completedSubtasks.length})
                </h3>
                <div className="space-y-2">
                  {completedSubtasks.map((subtask, index) => (
                    <SubtaskItem key={subtask.subtask_id} subtask={subtask} index={index} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add Subtask Dialog */}
      <Dialog open={showAddSubtask} onOpenChange={setShowAddSubtask}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-['Manrope']">Add New Subtask</DialogTitle>
            <DialogDescription>
              Break down "{task.name}" into smaller subtasks with date ranges.
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="new-subtask-start-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newSubtask.start_date
                        ? format(parseISO(newSubtask.start_date), "PPP")
                        : "Pick start date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={newSubtask.start_date ? parseISO(newSubtask.start_date) : undefined}
                      onSelect={(date) => {
                        if (date) {
                          setNewSubtask({ ...newSubtask, start_date: format(date, "yyyy-MM-dd") });
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                      data-testid="new-subtask-end-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newSubtask.end_date
                        ? format(parseISO(newSubtask.end_date), "PPP")
                        : "Pick end date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={newSubtask.end_date ? parseISO(newSubtask.end_date) : undefined}
                      onSelect={(date) => {
                        if (date) {
                          setNewSubtask({ ...newSubtask, end_date: format(date, "yyyy-MM-dd") });
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes (optional)</label>
              <Textarea
                placeholder="Add any notes about this subtask..."
                value={newSubtask.notes}
                onChange={(e) => setNewSubtask({ ...newSubtask, notes: e.target.value })}
                rows={3}
                data-testid="new-subtask-notes"
              />
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

      {/* Notes Dialog */}
      <Dialog open={!!notesDialog} onOpenChange={() => setNotesDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-['Manrope']">Completion Notes</DialogTitle>
            <DialogDescription>
              Add notes about "{notesDialog?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Enter notes about completion, blockers, or progress..."
              defaultValue={notesDialog?.notes || ""}
              onChange={(e) => {
                if (notesDialog) {
                  setNotesDialog({ ...notesDialog, notes: e.target.value });
                }
              }}
              rows={5}
              data-testid="subtask-notes-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (notesDialog) {
                  handleSaveNotes(notesDialog.subtask_id, notesDialog.notes || "");
                }
              }}
              data-testid="save-subtask-notes-btn"
            >
              Save Notes
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
