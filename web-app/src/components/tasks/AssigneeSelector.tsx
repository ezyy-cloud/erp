import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { X, ChevronDown, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getTaskAssignees } from '@/lib/services/taskAssignmentService';
import type { UserWithRole, TaskAssignee } from '@/lib/supabase/types';

interface AssigneeSelectorProps {
  taskId: string;
  allUsers: UserWithRole[];
  selectedAssigneeIds: string[];
  onSelectionChange: (selectedIds: string[]) => void;
  readOnly?: boolean;
}

export function AssigneeSelector({
  taskId,
  allUsers,
  selectedAssigneeIds,
  onSelectionChange,
  readOnly = false,
}: AssigneeSelectorProps) {
  const { permissions } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [, setAssigneeDetails] = useState<(TaskAssignee & { user?: UserWithRole })[]>([]);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchAssignees = async () => {
      if (taskId && taskId !== 'new-task-temp-id') {
        try {
          const { data: assignees } = await getTaskAssignees(taskId);
          if (assignees) {
            setAssigneeDetails(assignees);
          }
        } catch (err) {
          console.error('Error fetching assignees:', err);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    fetchAssignees();
  }, [taskId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggleUser = (userId: string) => {
    if (readOnly || !permissions.canAssignTasks) return;

    const isSelected = selectedAssigneeIds.includes(userId);
    const newSelection = isSelected
      ? selectedAssigneeIds.filter(id => id !== userId)
      : [...selectedAssigneeIds, userId];

    onSelectionChange(newSelection);
  };

  const handleRemoveAssignee = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (readOnly || !permissions.canAssignTasks) return;

    const newSelection = selectedAssigneeIds.filter(id => id !== userId);
    onSelectionChange(newSelection);
  };

  const selectedUsers = allUsers.filter(u => selectedAssigneeIds.includes(u.id));

  if (loading && taskId !== 'new-task-temp-id') {
    return <div className="text-sm text-muted-foreground">Loading assignees...</div>;
  }

  return (
    <div className="space-y-2">
      <Label>Assignees</Label>
      <div className="relative" ref={dropdownRef}>
        {/* Selected assignees display */}
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedUsers.map(user => (
            <div
              key={user.id}
              className="flex items-center gap-1 px-2 py-1 bg-muted rounded-md text-sm"
            >
              <span>{user.full_name ?? user.email}</span>
              {!readOnly && permissions.canAssignTasks && (
                <button
                  onClick={(e) => handleRemoveAssignee(user.id, e)}
                  className="ml-1 hover:text-destructive transition-colors"
                  type="button"
                  aria-label={`Remove ${user.full_name ?? user.email}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Dropdown button */}
        {!readOnly && permissions.canAssignTasks && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            className="w-full justify-between"
          >
            <span>Select Assignees</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
        )}

        {/* Dropdown menu with checkboxes */}
        {isOpen && !readOnly && permissions.canAssignTasks && (
          <div className="absolute z-50 mt-1 w-full bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
            {allUsers.length > 0 ? (
              <div className="p-1">
                {allUsers.map(user => {
                  const isSelected = selectedAssigneeIds.includes(user.id);
                  return (
                    <label
                      key={user.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer rounded-sm"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleUser(user.id)}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <span className="text-sm flex-1">
                        {user.full_name ?? user.email}
                      </span>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No users available
              </div>
            )}
          </div>
        )}
      </div>

      {selectedAssigneeIds.length === 0 && (
        <p className="text-sm text-muted-foreground">No assignees selected</p>
      )}
    </div>
  );
}
