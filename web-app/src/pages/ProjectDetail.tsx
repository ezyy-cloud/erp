import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePage } from '@/contexts/PageContext';
import { supabase } from '@/lib/supabase/client';
import type { Task, UserWithRole, ProjectStatus } from '@/lib/supabase/types';
import { ProjectStatus as ProjectStatusEnum } from '@/lib/supabase/types';
import { useRealtimeProjects } from '@/hooks/useRealtimeProjects';
import { useRealtimeTasks } from '@/hooks/useRealtimeTasks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { getProjectStatusDisplay, getTaskStatusDisplay, getPriorityDisplay } from '@/lib/utils/taskDisplay';
import { updateProject, closeProject, reopenProject } from '@/lib/services/projectService';
import { isTaskClosed } from '@/lib/services/projectService';
import { deleteProject } from '@/lib/services/projectDeletionService';
import { Link } from 'react-router-dom';
import { Edit, Save, X, ArrowLeft, Trash2 } from 'lucide-react';
import { Skeleton, SkeletonCard, SkeletonTaskCard } from '@/components/skeletons';

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { permissions, user } = useAuth();
  const { setBackButton, setActionButton } = usePage();
  const [members, setMembers] = useState<UserWithRole[]>([]);
  const [assignedUsers, setAssignedUsers] = useState<UserWithRole[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    description: '',
    status: 'active' as ProjectStatus,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Use real-time hooks
  const { projects: projectList, loading: projectsLoading } = useRealtimeProjects();
  const project = projectList.find((p) => p.id === id) ?? null;
  
  // Memoize filters to prevent infinite re-renders
  const taskFilters = useMemo(() => (id ? { projectId: id } : undefined), [id]);
  const { tasks: taskList, loading: tasksLoading } = useRealtimeTasks(taskFilters);
  const tasks = taskList.map((t) => t as Task);
  
  const loading = projectsLoading || tasksLoading;

  useEffect(() => {
    if (id) {
      fetchMembers();
      fetchAssignedUsers();
    }
  }, [id]);

  useEffect(() => {
    if (project) {
      setEditFormData({
        name: project.name,
        description: project.description ?? '',
        status: project.status as ProjectStatus,
      });
    }
  }, [project]);

  // Set back button in top nav
  useEffect(() => {
    setBackButton(
      <Button 
        variant="ghost" 
        size="icon"
        onClick={() => navigate('/projects')}
        className="h-10 w-10"
      >
        <ArrowLeft className="h-10 w-10" />
      </Button>
    );
    return () => {
      setBackButton(null);
    };
  }, [navigate, setBackButton]);

  const fetchMembers = async () => {
    if (!id) return;
    try {
      // Fetch project members first (without join since user_id references auth.users, not public.users)
      const { data: membersData, error: membersError } = await supabase
        .from('project_members')
        .select('*')
        .eq('project_id', id);

      if (membersError) throw membersError;

      if (membersData && membersData.length > 0) {
        // Extract user IDs and fetch users separately from public.users
        const userIds = [...new Set(membersData.map((m: any) => m.user_id).filter(Boolean))];
        
        const { data: usersData, error: usersError } = userIds.length > 0
          ? await supabase.from('users').select('*').in('id', userIds)
          : { data: [], error: null };

        if (usersError) throw usersError;

        const usersMap = new Map((usersData as any)?.map((u: any) => [u.id, u]) ?? []);

        // Combine members with user data
        const membersWithUsers = membersData.map((member: any) => {
          const user = usersMap.get(member.user_id);
          return {
            ...member,
            user: user ?? null,
          };
        });

        setMembers(membersWithUsers as any);
      } else {
        setMembers([]);
      }
    } catch (error) {
      console.error('Error fetching members:', error);
    }
  };

  const fetchAssignedUsers = async () => {
    if (!id) return;
    try {
      // Get all tasks for this project
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('assigned_to')
        .eq('project_id', id)
        .not('assigned_to', 'is', null);

      if (tasksError) throw tasksError;

      if (tasksData && tasksData.length > 0) {
        // Get unique user IDs from assigned_to
        const userIds = [...new Set(tasksData.map((t: any) => t.assigned_to).filter(Boolean))];
        
        if (userIds.length > 0) {
          // Fetch user details
          const { data: usersData, error: usersError } = await supabase
            .from('users')
            .select('*')
            .in('id', userIds);

          if (usersError) throw usersError;

          // Fetch roles for each user
          if (usersData && usersData.length > 0) {
            const usersWithRoles = await Promise.all(
              usersData.map(async (user: any) => {
                if (user.role_id) {
                  const { data: roleData } = await supabase
                    .from('roles')
                    .select('*')
                    .eq('id', user.role_id)
                    .single();
                  return { ...user, roles: roleData ?? undefined } as UserWithRole;
                }
                return { ...user } as UserWithRole;
              })
            );
            setAssignedUsers(usersWithRoles);
          } else {
            setAssignedUsers([]);
          }
        } else {
          setAssignedUsers([]);
        }
      } else {
        setAssignedUsers([]);
      }
    } catch (error) {
      console.error('Error fetching assigned users:', error);
      setAssignedUsers([]);
    }
  };

  const handleEdit = useCallback(() => {
    setIsEditing(true);
    setError(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setError(null);
    if (project) {
      setEditFormData({
        name: project.name,
        description: project.description ?? '',
        status: project.status as ProjectStatus,
      });
    }
  }, [project]);

  // Set edit button in top nav
  useEffect(() => {
    if (!permissions.canEditProjects) {
      setActionButton(null);
      return;
    }

    setActionButton(
      <Button
        variant="ghost"
        size="icon"
        onClick={isEditing ? handleCancelEdit : handleEdit}
        disabled={saving}
        className="h-10 w-10 p-0"
      >
        {isEditing ? (
          <X className="h-8 w-8" />
        ) : (
          <Edit className="h-8 w-8" />
        )}
      </Button>
    );
    return () => {
      setActionButton(null);
    };
  }, [isEditing, saving, permissions.canEditProjects, handleEdit, handleCancelEdit, setActionButton]);

  const handleSaveEdit = async () => {
    if (!project || !id) return;

    setSaving(true);
    setError(null);

    try {
      // If status is changing to closed, use close function
      if (editFormData.status === ProjectStatusEnum.CLOSED && project.status !== ProjectStatusEnum.CLOSED) {
        const result = await closeProject(id);
        if (!result.success) {
          setError(result.error ?? 'Failed to close project');
          setSaving(false);
          return;
        }
        // Update other fields if changed
        if (editFormData.name !== project.name || editFormData.description !== (project.description ?? '')) {
          const { error: updateError } = await updateProject({
            projectId: id,
            name: editFormData.name,
            description: editFormData.description,
          });
          if (updateError) {
            setError(updateError.message);
            setSaving(false);
            return;
          }
        }
      } else if (editFormData.status === ProjectStatusEnum.ACTIVE && project.status === ProjectStatusEnum.CLOSED) {
        // Reopening project
        const result = await reopenProject(id);
        if (!result.success) {
          setError(result.error ?? 'Failed to reopen project');
          setSaving(false);
          return;
        }
        // Update other fields if changed
        if (editFormData.name !== project.name || editFormData.description !== (project.description ?? '')) {
          const { error: updateError } = await updateProject({
            projectId: id,
            name: editFormData.name,
            description: editFormData.description,
          });
          if (updateError) {
            setError(updateError.message);
            setSaving(false);
            return;
          }
        }
      } else {
        // Regular update
        const { error: updateError } = await updateProject({
          projectId: id,
          name: editFormData.name,
          description: editFormData.description,
          status: editFormData.status,
        });
        if (updateError) {
          setError(updateError.message);
          setSaving(false);
          return;
        }
      }

      setIsEditing(false);
      // Project and tasks will update automatically via real-time subscription
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!project || !id || !user || !permissions.canDeleteProjects) return;

    const taskCount = tasks.length;
    const confirmMessage =
      `Are you sure you want to delete this project?\n\n` +
      `Project: ${project.name}\n` +
      `Tasks: ${taskCount}\n\n` +
      `This will permanently delete the project and all related tasks and members.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setDeleting(true);
    try {
      const { error: deleteError } = await deleteProject(id);
      if (deleteError) {
        alert(`Failed to delete project: ${deleteError.message}`);
        setDeleting(false);
        return;
      }
      navigate('/projects');
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="space-y-2">
          <Skeleton height={32} width="30%" variant="text" />
          <Skeleton height={16} width="50%" variant="text" />
        </div>

        {/* Project info skeleton */}
        <SkeletonCard showHeader={true} showContent={true} lines={4} />

        {/* Tasks list skeleton */}
        <div className="space-y-4">
          <Skeleton height={24} width="20%" variant="text" />
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonTaskCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground mb-4">Project not found</p>
        <Button onClick={() => navigate('/projects')}>Back to Projects</Button>
      </div>
    );
  }

  const statusDisplay = getProjectStatusDisplay(project.status);
  const StatusIcon = statusDisplay.icon;

  const isProjectClosed = project.status === ProjectStatusEnum.CLOSED;
  const closedTasksCount = tasks.filter(t => isTaskClosed(t)).length;

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mt-2 break-words">{project.name}</h1>
          <div className="flex items-center gap-2 mt-2">
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${statusDisplay.bgColor} ${statusDisplay.color}`}>
              <StatusIcon className="h-4 w-4" />
              <span className="text-sm font-medium">{statusDisplay.label}</span>
            </div>
            {isProjectClosed && closedTasksCount > 0 && (
              <span className="text-xs text-muted-foreground">
                ({closedTasksCount} task{closedTasksCount !== 1 ? 's' : ''} closed)
              </span>
            )}
          </div>
        </div>
      </div>

      {isEditing && permissions.canEditProjects && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle>Edit Project</CardTitle>
            <CardDescription>Update project details. Closing will cascade to all tasks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-name">Project Name</Label>
              <Input
                id="edit-name"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editFormData.description}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                id="edit-status"
                value={editFormData.status}
                onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as ProjectStatus })}
              >
                <option value={ProjectStatusEnum.ACTIVE}>Active</option>
                <option value={ProjectStatusEnum.CLOSED}>Closed</option>
                <option value={ProjectStatusEnum.COMPLETED}>Completed</option>
                <option value={ProjectStatusEnum.ARCHIVED}>Archived</option>
              </Select>
              {editFormData.status === ProjectStatusEnum.CLOSED && project.status !== ProjectStatusEnum.CLOSED && (
                <p className="text-xs text-muted-foreground">
                  ⚠️ Closing this project will automatically close all linked tasks. Tasks can be reactivated when the project is reopened.
                </p>
              )}
              {editFormData.status === ProjectStatusEnum.ACTIVE && project.status === ProjectStatusEnum.CLOSED && (
                <p className="text-xs text-muted-foreground">
                  ✓ Reopening this project will reactivate tasks that were closed due to project closure.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleSaveEdit} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={handleCancelEdit} disabled={saving}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent className="w-full overflow-x-hidden">
              <p className="text-sm whitespace-pre-wrap break-words">
                {project.description || 'No description'}
              </p>
            </CardContent>
          </Card>

          <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300 delay-75">
            <CardHeader>
              <CardTitle>Tasks ({tasks.length})</CardTitle>
              <CardDescription>Tasks associated with this project</CardDescription>
            </CardHeader>
            <CardContent className="w-full overflow-x-hidden">
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tasks in this project yet.</p>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task, index) => {
                    const taskStatusDisplay = getTaskStatusDisplay(task.status);
                    const priorityDisplay = getPriorityDisplay(task.priority);
                    const TaskStatusIcon = taskStatusDisplay.icon;
                    const PriorityIcon = priorityDisplay.icon;
                    const taskIsClosed = isTaskClosed(task);
                    const closedByProject = (task as any).closed_reason === 'project_closed';

                    return (
                      <Link
                        key={task.id}
                        to={`/tasks/${task.id}`}
                        className="block"
                      >
                        <div
                          className={`p-3 border rounded-lg transition-all duration-200 group ${
                            taskIsClosed 
                              ? 'bg-gray-50 opacity-75 cursor-not-allowed' 
                              : 'hover:bg-accent hover:shadow-sm hover:scale-[1.01]'
                          }`}
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h4 className={`text-sm font-medium break-words ${
                                taskIsClosed ? 'text-muted-foreground' : 'group-hover:text-primary transition-colors'
                              }`}>
                                {task.title}
                              </h4>
                              {task.description && (
                                <p className="text-xs text-muted-foreground break-words mt-1">
                                  {task.description}
                                </p>
                              )}
                              {taskIsClosed && closedByProject && (
                                <p className="text-xs text-muted-foreground italic mt-1">
                                  Closed because project is closed
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0 md:mt-0 mt-2">
                              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${taskStatusDisplay.bgColor} ${taskStatusDisplay.color}`}>
                                <TaskStatusIcon className="h-3 w-3" />
                                <span className="text-xs font-medium">{taskStatusDisplay.label}</span>
                              </div>
                              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${priorityDisplay.bgColor} ${priorityDisplay.color}`}>
                                <PriorityIcon className="h-3 w-3" />
                                <span className="text-xs font-medium">{priorityDisplay.label}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300 delay-150">
            <CardHeader>
              <CardTitle>Project Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 w-full overflow-x-hidden">
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm font-medium">
                  {new Date(project.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Updated</p>
                <p className="text-sm font-medium">
                  {new Date(project.updated_at).toLocaleDateString()}
                </p>
              </div>
              {assignedUsers.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Assigned Users</p>
                  <div className="space-y-2">
                    {assignedUsers.map((user) => {
                      const role = (user as any).roles as { name: string } | null;
                      return (
                        <div key={user.id} className="text-sm">
                          <p className="font-medium break-words">
                            {user.full_name ?? user.email ?? 'Unknown'}
                          </p>
                          {role && (
                            <p className="text-xs text-muted-foreground capitalize">
                              {role.name.replace('_', ' ')}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {permissions.canDeleteProjects && user && (
            <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300 delay-200 border-destructive/50">
              <CardHeader>
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
                <CardDescription>
                  Deleting a project permanently removes it and all related data.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  This action cannot be undone. All tasks and members will be removed.
                </p>
                <Button
                  variant="destructive"
                  onClick={handleDeleteProject}
                  disabled={deleting}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {deleting ? 'Deleting...' : 'Delete Project'}
                </Button>
              </CardContent>
            </Card>
          )}

          {members.length > 0 && (
            <Card className="animate-in fade-in slide-in-from-bottom-4 duration-300 delay-200">
              <CardHeader>
                <CardTitle>Members ({members.length})</CardTitle>
              </CardHeader>
              <CardContent className="w-full overflow-x-hidden">
                <div className="space-y-2">
                  {members.map((member: any) => (
                    <div key={member.id} className="text-sm">
                      <p className="font-medium">
                        {member.user?.full_name ?? member.user?.email ?? 'Unknown'}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {member.role ?? 'Member'}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
