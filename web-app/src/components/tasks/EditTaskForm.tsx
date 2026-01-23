import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { directEditTask } from '@/lib/services/taskEditRequestService';
import { getTaskAssignees } from '@/lib/services/taskAssignmentService';
import { getAllUsers } from '@/lib/services/userService';
import { AssigneeSelector } from './AssigneeSelector';
import type { Task, UserWithRole, ProposedTaskChanges } from '@/lib/supabase/types';
import { TaskPriority } from '@/lib/supabase/types';

interface EditTaskFormProps {
  task: Task;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditTaskForm({ task, onClose, onSuccess }: EditTaskFormProps) {
  const { user, permissions } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [currentAssignees, setCurrentAssignees] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editComment, setEditComment] = useState('');

  const [formData, setFormData] = useState({
    title: task.title,
    description: task.description ?? '',
    due_date: task.due_date ? new Date(task.due_date).toISOString().slice(0, 16) : '',
    priority: task.priority,
    assignees: [] as string[],
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch users
        const allUsers = await getAllUsers();
        setUsers(allUsers as UserWithRole[]);

        // Fetch current assignees
        const { data: assignees } = await getTaskAssignees(task.id);
        if (assignees) {
          const assigneeIds = assignees.map(a => a.user_id);
          setCurrentAssignees(assigneeIds);
          setFormData(prev => ({ ...prev, assignees: assigneeIds }));
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [task.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !permissions.canEditTasks) return;

    setSubmitting(true);
    setError(null);

    try {
      // Build changes object (only include changed fields)
      const changes: ProposedTaskChanges = {};
      
      if (formData.title !== task.title) {
        changes.title = formData.title;
      }
      if (formData.description !== (task.description ?? '')) {
        changes.description = formData.description || null;
      }
      if (formData.due_date !== (task.due_date ? new Date(task.due_date).toISOString().slice(0, 16) : '')) {
        changes.due_date = formData.due_date ? new Date(formData.due_date).toISOString() : null;
      }
      if (formData.priority !== task.priority) {
        changes.priority = formData.priority;
      }
      
      // Check if assignees changed
      const sortedCurrent = [...currentAssignees].sort();
      const sortedNew = [...formData.assignees].sort();
      const assigneesChanged = JSON.stringify(sortedCurrent) !== JSON.stringify(sortedNew);
      
      if (assigneesChanged) {
        changes.assignees = formData.assignees;
      }

      // Validate at least one change
      if (Object.keys(changes).length === 0) {
        setError('Please make at least one change');
        setSubmitting(false);
        return;
      }

      const { success, error: editError } = await directEditTask(
        task.id,
        user.id,
        changes,
        editComment || undefined
      );

      if (!success || editError) {
        setError(editError?.message ?? 'Failed to edit task');
        setSubmitting(false);
        return;
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          Loading...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Edit Task</CardTitle>
            <CardDescription>
              Make changes to this task. Changes will be applied immediately and logged for audit purposes.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="due_date">Due Date</Label>
              <Input
                id="due_date"
                type="datetime-local"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                id="priority"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              >
                <option value={TaskPriority.LOW}>Low</option>
                <option value={TaskPriority.MEDIUM}>Medium</option>
                <option value={TaskPriority.HIGH}>High</option>
                <option value={TaskPriority.URGENT}>Urgent</option>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <AssigneeSelector
              taskId={task.id}
              allUsers={users}
              selectedAssigneeIds={formData.assignees}
              onSelectionChange={(selectedIds) => {
                setFormData({ ...formData, assignees: selectedIds });
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="editComment">Edit Comment (Optional)</Label>
            <Textarea
              id="editComment"
              value={editComment}
              onChange={(e) => setEditComment(e.target.value)}
              placeholder="Add a comment explaining the changes..."
              rows={2}
            />
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
