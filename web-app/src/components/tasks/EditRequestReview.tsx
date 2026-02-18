import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { approveEditRequest, rejectEditRequest } from '@/lib/services/taskEditRequestService';
import type { TaskEditRequest, ProposedTaskChanges, Task } from '@/lib/supabase/types';

interface EditRequestReviewProps {
  request: TaskEditRequest & { task?: Task };
  onReviewed: () => void;
}

export function EditRequestReview({ request, onReviewed }: EditRequestReviewProps) {
  const { user, permissions } = useAuth();
  const [reviewComment, setReviewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!permissions.canApproveTaskEdits || !user) {
    return null;
  }

  const proposedChanges = request.proposed_changes as ProposedTaskChanges;

  const handleApprove = async () => {
    setLoading(true);
    setError(null);

    try {
      const { error: approveError } = await approveEditRequest(
        request.id,
        user.id,
        reviewComment || undefined
      );

      if (approveError) {
        setError(approveError.message);
        setLoading(false);
        return;
      }

      onReviewed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!reviewComment.trim()) {
      setError('Comments are required when rejecting an edit request');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: rejectError } = await rejectEditRequest(
        request.id,
        user.id,
        reviewComment
      );

      if (rejectError) {
        setError(rejectError.message);
        setLoading(false);
        return;
      }

      onReviewed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review Edit Request</CardTitle>
        <CardDescription>
          Task: {request.task?.title ?? 'Unknown Task'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
          {proposedChanges.title && (
            <div>
              <Label>Title Change</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="p-2 bg-muted rounded text-sm">
                  <p className="text-muted-foreground text-xs mb-1">Current:</p>
                  <p>{request.task?.title ?? 'N/A'}</p>
                </div>
                <div className="p-2 bg-muted rounded text-sm">
                  <p className="text-muted-foreground text-xs mb-1">Proposed:</p>
                  <p>{proposedChanges.title}</p>
                </div>
              </div>
            </div>
          )}

          {proposedChanges.description !== undefined && (
            <div>
              <Label>Description Change</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="p-2 bg-muted rounded text-sm min-h-[80px]">
                  <p className="text-muted-foreground text-xs mb-1">Current:</p>
                  <p>{request.task?.description || '(No description)'}</p>
                </div>
                <div className="p-2 bg-muted rounded text-sm min-h-[80px]">
                  <p className="text-muted-foreground text-xs mb-1">Proposed:</p>
                  <p>{proposedChanges.description || '(No description)'}</p>
                </div>
              </div>
            </div>
          )}

          {proposedChanges.due_date !== undefined && (
            <div>
              <Label>Due Date Change</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="p-2 bg-muted rounded text-sm">
                  <p className="text-muted-foreground text-xs mb-1">Current:</p>
                  <p>{request.task?.due_date ? new Date(request.task.due_date).toLocaleString() : '(No due date)'}</p>
                </div>
                <div className="p-2 bg-muted rounded text-sm">
                  <p className="text-muted-foreground text-xs mb-1">Proposed:</p>
                  <p>{proposedChanges.due_date ? new Date(proposedChanges.due_date).toLocaleString() : '(No due date)'}</p>
                </div>
              </div>
            </div>
          )}

          {proposedChanges.priority && (
            <div>
              <Label>Priority Change</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="p-2 bg-muted rounded text-sm">
                  <p className="text-muted-foreground text-xs mb-1">Current:</p>
                  <p className="capitalize">{request.task?.priority ?? 'N/A'}</p>
                </div>
                <div className="p-2 bg-muted rounded text-sm">
                  <p className="text-muted-foreground text-xs mb-1">Proposed:</p>
                  <p className="capitalize">{proposedChanges.priority}</p>
                </div>
              </div>
            </div>
          )}

          {proposedChanges.assignees && (
            <div>
              <Label>Assignee Changes</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="p-2 bg-muted rounded text-sm">
                  <p className="text-muted-foreground text-xs mb-1">Current:</p>
                  <p className="text-xs">(Check task for current assignees)</p>
                </div>
                <div className="p-2 bg-muted rounded text-sm">
                  <p className="text-muted-foreground text-xs mb-1">Proposed:</p>
                  <p className="text-xs">{proposedChanges.assignees.length} assignee(s)</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="reviewComment">Review Comments</Label>
          <Textarea
            id="reviewComment"
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            placeholder="Add comments about your decision (required for rejection)"
            rows={3}
          />
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={handleApprove}
            disabled={loading}
            className="flex-1"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Approve
          </Button>
          <Button
            onClick={handleReject}
            disabled={loading || !reviewComment.trim()}
            variant="destructive"
            className="flex-1"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
