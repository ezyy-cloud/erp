import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, X } from 'lucide-react';

export type TaskStatusAction = 'start-work' | 'mark-done' | 'request-review';

interface TaskStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (action: TaskStatusAction, note?: string) => Promise<void>;
  action: TaskStatusAction;
  taskTitle: string;
  currentStatus: string;
  loading?: boolean;
}

const actionLabels: Record<TaskStatusAction, { title: string; description: string; buttonText: string }> = {
  'start-work': {
    title: 'Start Work on Task',
    description: 'This will move the task from ToDo to Work-In-Progress. You can add an optional note about starting work.',
    buttonText: 'Start Work',
  },
  'mark-done': {
    title: 'Mark Task as Done',
    description: 'This will mark the task as done and request review. You can add an optional note.',
    buttonText: 'Mark as Done',
  },
  'request-review': {
    title: 'Request Review',
    description: 'This will mark the task as done and request review. You can add an optional note.',
    buttonText: 'Request Review',
  },
};

export function TaskStatusModal({
  isOpen,
  onClose,
  onConfirm,
  action,
  taskTitle,
  currentStatus,
  loading = false,
}: TaskStatusModalProps) {
  const [note, setNote] = useState('');
  const actionInfo = actionLabels[action];

  const handleConfirm = async () => {
    await onConfirm(action, note.trim() || undefined);
    setNote(''); // Reset note after confirmation
  };

  const handleClose = () => {
    if (!loading) {
      setNote('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] relative">
        <button
          onClick={handleClose}
          disabled={loading}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
        <DialogHeader>
          <DialogTitle>{actionInfo.title}</DialogTitle>
          <DialogDescription className="space-y-2">
            <p>{actionInfo.description}</p>
            <p className="text-sm font-medium mt-2">
              Task: <span className="font-normal">{taskTitle}</span>
            </p>
            <p className="text-sm font-medium">
              Current Status: <span className="font-normal">{currentStatus}</span>
            </p>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="note">Optional Note</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note about this status change (optional)..."
              rows={3}
              disabled={loading}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading}
            className="min-w-[120px]"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              actionInfo.buttonText
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
