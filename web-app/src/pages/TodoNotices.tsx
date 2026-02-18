import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle, Circle, Edit2, Trash2 } from 'lucide-react';
import { createBulletin, updateBulletin, deleteBulletin } from '@/lib/services/bulletinService';
import {
  createTodoWithAssignees,
  updateTodo,
  deleteTodo,
  toggleTodoCompletionForUser,
  type TodoWithRelations,
} from '@/lib/services/todoService';
import type { BulletinWithCreator } from '@/lib/services/bulletinService';
import type { User } from '@/lib/supabase/types';
import { supabase } from '@/lib/supabase/client';
import { useRealtimeBulletins } from '@/hooks/useRealtimeBulletins';
import { useRealtimeTodos } from '@/hooks/useRealtimeTodos';

interface BulletinFormState {
  id?: string;
  title: string;
  body: string;
  expiresAt: string;
}

interface TodoFormState {
  id?: string;
  text: string;
  assigneeIds: string[];
}

export function TodoNotices() {
  const { permissions, user } = useAuth();
  const { bulletins, loading: bulletinsLoading, refetch: refetchBulletins } = useRealtimeBulletins();
  const { todos, loading: todosLoading, refetch: refetchTodos } = useRealtimeTodos();
  const [users, setUsers] = useState<User[]>([]);
  const loading = bulletinsLoading || todosLoading;
  const [savingBulletin, setSavingBulletin] = useState(false);
  const [savingTodo, setSavingTodo] = useState(false);
  const [bulletinForm, setBulletinForm] = useState<BulletinFormState>({
    title: '',
    body: '',
    expiresAt: '',
  });
  const [editingBulletinId, setEditingBulletinId] = useState<string | undefined>(undefined);
  const [todoForm, setTodoForm] = useState<TodoFormState>({
    text: '',
    assigneeIds: [],
  });
  const [editingTodoId, setEditingTodoId] = useState<string | undefined>(undefined);
  const [showBulletinForm, setShowBulletinForm] = useState(false);
  const [showTodoForm, setShowTodoForm] = useState(false);

  const canManageBulletins = permissions.canManageBulletins;
  const canManageTodos = permissions.canManageTodos;

  useEffect(() => {
    let isMounted = true;
    supabase
      .from('users')
      .select('*')
      .is('deleted_at', null)
      .eq('is_active', true)
      .then(({ data, error }) => {
        if (isMounted && !error && data) {
          setUsers(data as User[]);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const currentUserId = user?.id ?? null;

  const resetBulletinForm = () => {
    setBulletinForm({
      title: '',
      body: '',
      expiresAt: '',
    });
    setEditingBulletinId(undefined);
  };

  const resetTodoForm = () => {
    setTodoForm({
      text: '',
      assigneeIds: [],
    });
    setEditingTodoId(undefined);
  };

  const handleBulletinSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageBulletins) return;

    if (!bulletinForm.title.trim() || !bulletinForm.body.trim()) {
      return;
    }

    setSavingBulletin(true);
    try {
      const expiresAtValue = bulletinForm.expiresAt.trim()
        ? new Date(bulletinForm.expiresAt).toISOString()
        : null;

      if (editingBulletinId) {
        const { error } = await updateBulletin(editingBulletinId, {
          title: bulletinForm.title.trim(),
          body: bulletinForm.body.trim(),
          expiresAt: expiresAtValue,
        });
        if (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to update bulletin', error);
        }
      } else {
        const { error } = await createBulletin({
          title: bulletinForm.title.trim(),
          body: bulletinForm.body.trim(),
          expiresAt: expiresAtValue,
        });
        if (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to create bulletin', error);
        }
      }

      resetBulletinForm();
      setShowBulletinForm(false);
      refetchBulletins();
    } finally {
      setSavingBulletin(false);
    }
  };

  const handleEditBulletin = (b: BulletinWithCreator) => {
    setEditingBulletinId(b.id);
    setBulletinForm({
      id: b.id,
      title: b.title,
      body: b.body,
      expiresAt: b.expires_at ?? '',
    });
    setShowBulletinForm(true);
  };

  const handleDeleteBulletin = async (id: string) => {
    if (!canManageBulletins) return;
    const { error } = await deleteBulletin(id);
    if (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete bulletin', error);
      return;
    }
    if (editingBulletinId === id) {
      resetBulletinForm();
      setShowBulletinForm(false);
    }
    refetchBulletins();
  };

  const handleTodoSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageTodos) return;

    const text = todoForm.text.trim();
    if (!text || text.includes('\n')) {
      return;
    }

    setSavingTodo(true);
    try {
      if (editingTodoId) {
        const { error } = await updateTodo(editingTodoId, {
          text,
          assigneeIds: todoForm.assigneeIds,
        });
        if (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to update todo', error);
        }
      } else {
        const { error } = await createTodoWithAssignees({
          text,
          assigneeIds: todoForm.assigneeIds,
        });
        if (error) {
          // eslint-disable-next-line no-console
          console.error('Failed to create todo', error);
        }
      }

      resetTodoForm();
      setShowTodoForm(false);
      refetchTodos();
    } finally {
      setSavingTodo(false);
    }
  };

  const handleEditTodo = (todo: TodoWithRelations) => {
    setEditingTodoId(todo.id);
    setTodoForm({
      id: todo.id,
      text: todo.text,
      assigneeIds: todo.assignees.map((a) => a.id),
    });
    setShowTodoForm(true);
  };

  const handleDeleteTodo = async (id: string) => {
    if (!canManageTodos) return;
    const { error } = await deleteTodo(id);
    if (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete todo', error);
      return;
    }
    if (editingTodoId === id) {
      resetTodoForm();
      setShowTodoForm(false);
    }
    refetchTodos();
  };

  const handleToggleCompletion = async (todoId: string) => {
    if (!currentUserId) return;
    const { error } = await toggleTodoCompletionForUser(todoId);
    if (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to toggle completion', error);
      return;
    }
    refetchTodos();
  };

  const assigneeOptions = useMemo(
    () =>
      users.map((u) => ({
        id: u.id,
        label: u.full_name ?? u.email,
      })),
    [users]
  );

  return (
    <div className="space-y-6">
      {/* Bulletin Board */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Bulletin Board</CardTitle>
            <CardDescription>Company-wide notices. Informational only.</CardDescription>
          </div>
          {canManageBulletins && (
            <Button
              size="sm"
              variant={showBulletinForm ? 'outline' : 'default'}
              onClick={() => {
                if (showBulletinForm) {
                  resetBulletinForm();
                  setShowBulletinForm(false);
                } else {
                  resetBulletinForm();
                  setShowBulletinForm(true);
                }
              }}
            >
              {showBulletinForm ? 'Cancel' : 'Add notice'}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading notices...</p>
          ) : bulletins.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No active notices.
            </p>
          ) : (
            <div className="space-y-3">
              {bulletins.map((b) => (
                <div
                  key={b.id}
                  className="border rounded-md px-3 py-2 sm:px-4 sm:py-3 flex flex-col gap-1"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{b.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.creator?.full_name ?? b.creator?.email ?? 'Unknown'} ·{' '}
                        {new Date(b.created_at).toLocaleDateString()}
                        {b.expires_at && (
                          <span className="ml-1">
                            · Expires {new Date(b.expires_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    {canManageBulletins && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => handleEditBulletin(b)}
                          aria-label="Edit notice"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDeleteBulletin(b.id)}
                          aria-label="Delete notice"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                    {b.body}
                  </p>
                </div>
              ))}
            </div>
          )}

          {canManageBulletins && showBulletinForm && (
            <form onSubmit={handleBulletinSubmit} className="space-y-3 border rounded-md p-3 sm:p-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="bulletin-title">Title</Label>
                <Input
                  id="bulletin-title"
                  value={bulletinForm.title}
                  onChange={(e) => setBulletinForm((prev) => ({ ...prev, title: e.target.value }))}
                  maxLength={120}
                  placeholder="Short notice title"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="bulletin-body">Body</Label>
                <Textarea
                  id="bulletin-body"
                  value={bulletinForm.body}
                  onChange={(e) => setBulletinForm((prev) => ({ ...prev, body: e.target.value }))}
                  placeholder="Details everyone should know..."
                  rows={3}
                />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex flex-col gap-2 flex-1">
                  <Label htmlFor="bulletin-expires">Expiry (optional)</Label>
                  <Input
                    id="bulletin-expires"
                    type="datetime-local"
                    value={bulletinForm.expiresAt}
                    onChange={(e) =>
                      setBulletinForm((prev) => ({
                        ...prev,
                        expiresAt: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="flex items-end justify-end gap-2 pt-2 sm:pt-7">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={savingBulletin}
                  >
                    {editingBulletinId ? 'Save changes' : 'Publish notice'}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* To-Do List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Team To-Do</CardTitle>
            <CardDescription>Lightweight reminders assigned to specific people.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading to-dos...</p>
          ) : todos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No to-dos yet.
            </p>
          ) : (
            <div className="space-y-2">
              {todos.map((todo) => {
                const assignedUserIdSet = new Set(todo.assignees.map((a) => a.id));
                const isAssignedToCurrentUser =
                  currentUserId != null ? assignedUserIdSet.has(currentUserId) : false;
                const currentUserCompletion = todo.completions.find(
                  (c) => c.user_id === currentUserId
                );
                const completedByCurrentUser = !!currentUserCompletion;

                const totalAssignees = todo.assignees.length;
                const completedCount = todo.completions.filter((c) =>
                  assignedUserIdSet.has(c.user_id)
                ).length;

                const Icon = completedByCurrentUser ? CheckCircle : Circle;

                return (
                  <div
                    key={todo.id}
                    className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-accent transition-colors"
                  >
                    <button
                      type="button"
                      className="h-8 w-8 rounded-full flex items-center justify-center border border-muted-foreground/40"
                      onClick={() => {
                        if (!isAssignedToCurrentUser) return;
                        void handleToggleCompletion(todo.id);
                      }}
                      disabled={!isAssignedToCurrentUser}
                      aria-label={completedByCurrentUser ? 'Mark as not completed' : 'Mark as completed'}
                    >
                      <Icon
                        className={`h-5 w-5 ${
                          completedByCurrentUser
                            ? 'text-primary'
                            : isAssignedToCurrentUser
                              ? 'text-muted-foreground'
                              : 'text-muted-foreground/40'
                        }`}
                      />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-sm truncate ${
                          completedByCurrentUser ? 'line-through text-muted-foreground' : ''
                        }`}
                      >
                        {todo.text}
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                        {todo.assignees.length > 0 ? (
                          <>
                            <span>
                              Assigned to:{' '}
                              {todo.assignees
                                .map((a) => a.full_name ?? a.email)
                                .join(', ')}
                            </span>
                            <span>
                              · {completedCount}/{totalAssignees} completed
                            </span>
                          </>
                        ) : (
                          <span>Unassigned</span>
                        )}
                      </div>
                    </div>
                    {canManageTodos && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => handleEditTodo(todo)}
                          aria-label="Edit to-do"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDeleteTodo(todo.id)}
                          aria-label="Delete to-do"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {canManageTodos && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant={showTodoForm ? 'outline' : 'default'}
                onClick={() => {
                  if (showTodoForm) {
                    resetTodoForm();
                    setShowTodoForm(false);
                  } else {
                    resetTodoForm();
                    setShowTodoForm(true);
                  }
                }}
              >
                {showTodoForm ? 'Cancel' : 'Add to-do'}
              </Button>
            </div>
          )}

          {canManageTodos && showTodoForm && (
            <form onSubmit={handleTodoSubmit} className="space-y-3 border rounded-md p-3 sm:p-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="todo-text">To-Do</Label>
                <Input
                  id="todo-text"
                  value={todoForm.text}
                  onChange={(e) =>
                    setTodoForm((prev) => ({
                      ...prev,
                      text: e.target.value.replaceAll('\n', ' '),
                    }))
                  }
                  maxLength={200}
                  placeholder="One-sentence reminder"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Assignees</Label>
                <div className="flex flex-wrap gap-2">
                  {assigneeOptions.map((option) => {
                    const selected = todoForm.assigneeIds.includes(option.id);
                    return (
                      <Button
                        key={option.id}
                        type="button"
                        size="sm"
                        variant={selected ? 'default' : 'outline'}
                        className="rounded-full px-3 py-1 text-xs"
                        onClick={() => {
                          setTodoForm((prev) => {
                            const isSelected = prev.assigneeIds.includes(option.id);
                            return {
                              ...prev,
                              assigneeIds: isSelected
                                ? prev.assigneeIds.filter((id) => id !== option.id)
                                : [...prev.assigneeIds, option.id],
                            };
                          });
                        }}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                  {assigneeOptions.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      No users available yet.
                    </span>
                  )}
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <Button type="submit" size="sm" disabled={savingTodo}>
                  {editingTodoId ? 'Save changes' : 'Add To-Do'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

