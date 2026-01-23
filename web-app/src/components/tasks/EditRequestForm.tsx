import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createEditRequest } from '@/lib/services/taskEditRequestService';
import { getTaskAssignees } from '@/lib/services/taskAssignmentService';
import { getAllUsers } from '@/lib/services/userService';
import type { Task, UserWithRole, ProposedTaskChanges } from '@/lib/supabase/types';
import { TaskPriority } from '@/lib/supabase/types';

interface EditRequestFormProps {
  task: Task;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditRequestForm({ task, onClose, onSuccess }: EditRequestFormProps) {
  const { user, permissions } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [currentAssignees, setCurrentAssignees] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [proposedChanges, setProposedChanges] = useState<ProposedTaskChanges>({
    title: task.title,
    description: task.description ?? '',
    due_date: task.due_date ? new Date(task.due_date).toISOString().slice(0, 16) : '',
    priority: task.priority,
    assignees: [],
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
          setProposedChanges(prev => ({ ...prev, assignees: assigneeIds }));
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
    if (!user || !permissions.canRequestTaskEdit) return;

    setSubmitting(true);
    setError(null);

    try {
      // Build proposed changes object (only include changed fields)
      const changes: ProposedTaskChanges = {};
      
      if (proposedChanges.title !== task.title) {
        changes.title = proposedChanges.title;
      }
      if (proposedChanges.description !== (task.description ?? '')) {
        changes.description = proposedChanges.description || null;
      }
      if (proposedChanges.due_date !== (task.due_date ? new Date(task.due_date).toISOString().slice(0, 16) : '')) {
        changes.due_date = proposedChanges.due_date ? new Date(proposedChanges.due_date).toISOString() : null;
      }
      if (proposedChanges.priority !== task.priority) {
        changes.priority = proposedChanges.priority;
      }
      
      // Check if assignees changed
      const assigneesChanged = 
        proposedChanges.assignees?.length !== currentAssignees.length ||
        !proposedChanges.assignees?.every(id => currentAssignees.includes(id));
      
      if (assigneesChanged) {
        changes.assignees = proposedChanges.assignees ?? [];
      }

      // Validate at least one change
      if (Object.keys(changes).length === 0) {
        setError('Please make at least one change');
        setSubmitting(false);
        return;
      }

      const { data, error: createError } = await createEditRequest({
        taskId: task.id,
        requestedBy: user.id,
        proposedChanges: changes,
      });

      if (createError || !data) {
        setError(createError?.message ?? 'Failed to create edit request');
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
            <CardTitle>Request Task Edit</CardTitle>
            <CardDescription>
              Propose changes to this task. A Super Admin will review and approve or reject your request.
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
            <Label>Title</Label>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Current:</p>
                <p className="p-2 bg-muted rounded">{task.title}</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Proposed:</p>
                <Input
                  value={proposedChanges.title ?? ''}
                  onChange={(e) => setProposedChanges({ ...proposedChanges, title: e.target.value })}
                  placeholder="Enter new title"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Current:</p>
                <p className="p-2 bg-muted rounded min-h-[100px]">
                  {task.description || '(No description)'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Proposed:</p>
                <Textarea
                  value={proposedChanges.description ?? ''}
                  onChange={(e) => setProposedChanges({ ...proposedChanges, description: e.target.value })}
                  placeholder="Enter new description"
                  rows={4}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Due Date</Label>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Current:</p>
                  <p className="p-2 bg-muted rounded">
                    {task.due_date ? new Date(task.due_date).toLocaleString() : '(No due date)'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Proposed:</p>
                  <Input
                    type="datetime-local"
                    value={proposedChanges.due_date ?? ''}
                    onChange={(e) => setProposedChanges({ ...proposedChanges, due_date: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground mb-1">Current:</p>
                  <p className="p-2 bg-muted rounded capitalize">{task.priority}</p>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1">Proposed:</p>
                  <Select
                    value={proposedChanges.priority ?? TaskPriority.MEDIUM}
                    onChange={(e) => setProposedChanges({ ...proposedChanges, priority: e.target.value })}
                  >
                    <option value={TaskPriority.LOW}>Low</option>
                    <option value={TaskPriority.MEDIUM}>Medium</option>
                    <option value={TaskPriority.HIGH}>High</option>
                    <option value={TaskPriority.URGENT}>Urgent</option>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Assignees</Label>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Current:</p>
                <div className="p-2 bg-muted rounded space-y-1">
                  {currentAssignees.length > 0 ? (
                    currentAssignees.map(userId => {
                      const user = users.find(u => u.id === userId);
                      return (
                        <div key={userId} className="text-sm">
                          {user?.full_name ?? user?.email ?? 'Unknown User'}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-muted-foreground">(No assignees)</p>
                  )}
                </div>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Proposed:</p>
                <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded-md p-2">
                  {users.map((u) => {
                    const isSelected = proposedChanges.assignees?.includes(u.id) ?? false;
                    return (
                      <label key={u.id} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const current = proposedChanges.assignees ?? [];
                            if (e.target.checked) {
                              setProposedChanges({ 
                                ...proposedChanges, 
                                assignees: [...current, u.id] 
                              });
                            } else {
                              setProposedChanges({ 
                                ...proposedChanges, 
                                assignees: current.filter(id => id !== u.id) 
                              });
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{u.full_name ?? u.email}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Edit Request'}
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
