import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Edit, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getEditRequests } from '@/lib/services/taskEditRequestService';
import type { TaskEditRequest } from '@/lib/supabase/types';

interface EditRequestButtonProps {
  taskId: string;
  onRequestClick: () => void;
}

export function EditRequestButton({ taskId, onRequestClick }: EditRequestButtonProps) {
  const { permissions } = useAuth();
  const [pendingRequest, setPendingRequest] = useState<TaskEditRequest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!permissions.canRequestTaskEdit) {
      setLoading(false);
      return;
    }

    // Check for pending requests
    getEditRequests(taskId).then(({ data, error }) => {
      if (!error && data) {
        const pending = data.find(req => req.status === 'pending');
        setPendingRequest(pending ?? null);
      }
      setLoading(false);
    });
  }, [taskId, permissions.canRequestTaskEdit]);

  if (!permissions.canRequestTaskEdit) {
    return null;
  }

  if (loading) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Edit className="h-4 w-4 mr-2" />
        Loading...
      </Button>
    );
  }

  if (pendingRequest) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Clock className="h-4 w-4 mr-2" />
        Edit Request Pending
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={onRequestClick}>
      <Edit className="h-4 w-4 mr-2" />
      Request Edit
    </Button>
  );
}
