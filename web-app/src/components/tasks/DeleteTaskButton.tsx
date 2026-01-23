import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { softDeleteTask } from '@/lib/services/taskDeletionService';
import type { Task } from '@/lib/supabase/types';

interface DeleteTaskButtonProps {
  task: Task;
  onDeleted: () => void;
}

export function DeleteTaskButton({ task, onDeleted }: DeleteTaskButtonProps) {
  const { user, permissions } = useAuth();
  const [loading, setLoading] = useState(false);

  if (!permissions.canDeleteTasks || !user) {
    return null;
  }

  const handleDelete = async () => {
    if (!confirm(
      `Are you sure you want to delete this task?\n\n` +
      `Task: ${task.title}\n\n` +
      `This will soft-delete the task. It will be hidden from normal views but can be restored later.`
    )) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await softDeleteTask(task.id, user.id);
      if (error) {
        alert(`Failed to delete task: ${error.message}`);
        setLoading(false);
        return;
      }
      onDeleted();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setLoading(false);
    }
  };

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={handleDelete}
      disabled={loading}
    >
      <Trash2 className="h-4 w-4 mr-2" />
      {loading ? 'Deleting...' : 'Delete Task'}
    </Button>
  );
}
