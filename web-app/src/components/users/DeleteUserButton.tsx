import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { softDeleteUser, getUserTasks } from '@/lib/services/userDeletionService';
import type { UserWithRole } from '@/lib/supabase/types';

interface DeleteUserButtonProps {
  user: UserWithRole;
  onDeleted: () => void;
}

export function DeleteUserButton({ user, onDeleted }: DeleteUserButtonProps) {
  const { user: currentUser, permissions } = useAuth();
  const [loading, setLoading] = useState(false);

  if (!permissions.canDeleteUsers || !currentUser) {
    return null;
  }

  // Cannot delete yourself
  if (user.id === currentUser.id) {
    return null;
  }

  const handleDelete = async () => {
    // Fetch task count first
    const { data: tasks } = await getUserTasks(user.id);
    const count = tasks?.length ?? 0;

    let reassignTo: string | null | undefined = null;
    
    if (count > 0) {
      const reassignUserId = prompt(
        `This user has ${count} assigned task(s).\n\n` +
        `Enter a user ID to reassign tasks to, or leave empty to orphan them:\n` +
        `(You can find user IDs in the Users page)`
      );
      
      if (reassignUserId && reassignUserId.trim()) {
        reassignTo = reassignUserId.trim();
      } else if (reassignUserId !== null) {
        // User cancelled or left empty
        if (!confirm(`Tasks will be orphaned. Continue with deletion?`)) {
          return;
        }
      } else {
        // User cancelled the prompt
        return;
      }
    }

    if (!confirm(
      `Are you sure you want to delete this user?\n\n` +
      `User: ${user.full_name ?? user.email}\n` +
      `Tasks: ${count} (${reassignTo ? 'will be reassigned' : 'will be orphaned'})\n\n` +
      `This will soft-delete the user. They will be hidden from normal views but can be restored later.`
    )) {
      return;
    }

    setLoading(true);
    try {
      const { result, error } = await softDeleteUser({
        userId: user.id,
        deletedBy: currentUser.id,
        reassignTasksTo: reassignTo ?? undefined,
      });

      if (error) {
        alert(`Failed to delete user: ${error.message}`);
        setLoading(false);
        return;
      }

      if (result) {
        alert(
          `User deleted successfully.\n` +
          `Tasks reassigned: ${result.tasksReassigned ?? 0}\n` +
          `Tasks orphaned: ${result.tasksOrphaned ?? 0}`
        );
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
      onClick={async (e) => {
        e.stopPropagation();
        await handleDelete();
      }}
      disabled={loading}
      className="w-full"
    >
      <Trash2 className="h-4 w-4 mr-2" />
      {loading ? 'Deleting...' : 'Delete User'}
    </Button>
  );
}
