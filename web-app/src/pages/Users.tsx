import { useEffect, useState, memo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePage } from '@/contexts/PageContext';
import { useNavigate } from 'react-router-dom';
import { 
  createUser, 
  toggleUserStatus, 
  updateUser,
  resetUserPassword,
  type CreateUserResult,
  type ResetPasswordResult 
} from '@/lib/services/userService';
import { useRealtimeUsers } from '@/hooks/useRealtimeUsers';
import { getUserTaskCounts, type UserTaskCounts } from '@/lib/services/userPerformanceService';
import type { UserWithRole } from '@/lib/supabase/types';
import { UserRole } from '@/lib/supabase/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Edit, Key, X, Save, Power, TrendingUp, Plus } from 'lucide-react';
import { Skeleton, SkeletonUserCard } from '@/components/skeletons';
import { DeleteUserButton } from '@/components/users/DeleteUserButton';

// Memoized user card component
const UserCard = memo(({ 
  user, 
  editingUserId, 
  editFormData, 
  resettingPassword,
  taskCounts,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onStatusToggle,
  onResetPassword,
  onUserDeleted,
  onViewPerformance,
  setEditFormData,
}: {
  user: UserWithRole;
  editingUserId: string | null;
  editFormData: { email: string; fullName: string; role: UserRole } | null;
  resettingPassword: string | null;
  taskCounts: UserTaskCounts | null;
  onEdit: (user: UserWithRole) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onStatusToggle: (userId: string, currentStatus: boolean) => void;
  onResetPassword: (userId: string) => void;
  onUserDeleted: () => void;
  onViewPerformance: (userId: string) => void;
  setEditFormData: React.Dispatch<React.SetStateAction<{ email: string; fullName: string; role: UserRole } | null>>;
}) => {
  const isEditing = editingUserId === user.id;

  // Handle card click - navigate to performance page
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on edit button or inside edit form
    if (isEditing || (e.target as HTMLElement).closest('button, input, select')) {
      return;
    }
    onViewPerformance(user.id);
  };

  return (
    <Card 
      className={`cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 ${
        isEditing ? 'border-primary' : ''
      }`}
      onClick={handleCardClick}
    >
      {isEditing && editFormData ? (
        // Edit mode - full card becomes edit form
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Edit User</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onCancelEdit();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={editFormData.email}
                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                type="email"
                required
                onClick={(e) => e.stopPropagation()}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                value={editFormData.fullName}
                onChange={(e) => setEditFormData({ ...editFormData, fullName: e.target.value })}
                required
                onClick={(e) => e.stopPropagation()}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={editFormData.role}
                onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value as UserRole })}
                onClick={(e) => e.stopPropagation()}
                className="w-full"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Button
                variant={user.is_active ? "default" : "outline"}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusToggle(user.id, user.is_active);
                }}
                className="w-full"
              >
                <Power className="h-4 w-4 mr-2" />
                {user.is_active ? 'Active' : 'Inactive'}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onResetPassword(user.id);
              }}
              disabled={resettingPassword === user.id}
              className="w-full"
            >
              <Key className="h-4 w-4 mr-2" />
              {resettingPassword === user.id ? 'Resetting...' : 'Reset Password'}
            </Button>
            <DeleteUserButton
              user={user}
              onDeleted={onUserDeleted}
            />
          </div>
          <div className="flex items-center gap-2 pt-2 border-t">
            <Button 
              onClick={(e) => {
                e.stopPropagation();
                onSaveEdit();
              }} 
              size="sm"
              className="flex-1"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                onCancelEdit();
              }}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      ) : (
        // View mode - stats-focused card matching RFQ format
        <CardContent className="p-4">
          <div className="space-y-3">
            {/* Header: Title on left, Status badge on right */}
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base truncate pr-2">{user.full_name ?? 'No name'}</h3>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${
                  user.is_active
                    ? 'bg-muted text-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  <TrendingUp className="h-3 w-3" />
                  {user.is_active ? 'Active' : 'Inactive'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(user);
                  }}
                  className="h-10 w-10 p-0"
                  title="Edit User"
                >
                  <Edit className="h-9 w-9" />
                </Button>
              </div>
            </div>

            {/* Metrics: Vertical list with label left, value right */}
            {taskCounts ? (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total</span>
                    <span className="text-sm font-semibold">{taskCounts.total_assigned}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Completed</span>
                    <span className="text-sm font-semibold text-foreground">
                      {taskCounts.total_completed}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Pending</span>
                    <span className="text-sm font-semibold text-muted-foreground">
                      {taskCounts.total_pending}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Work-In-Progress</span>
                    <span className="text-sm font-semibold text-muted-foreground">
                      {taskCounts.total_in_progress}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Pending Review</span>
                    <span className="text-sm font-semibold text-muted-foreground">
                      {taskCounts.total_pending_review}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Closed</span>
                    <span className="text-sm font-semibold">{taskCounts.total_archived}</span>
                  </div>
                </div>

                {/* Separator */}
                <div className="border-t"></div>

                {/* Progress Bar: Show task distribution */}
                <div className="w-full">
                  {taskCounts.total_assigned > 0 ? (
                    <div className="w-full h-2 rounded-full overflow-hidden flex bg-muted/30">
                      {/* Completed segment (green) */}
                      {taskCounts.total_completed > 0 && (
                        <div
                          className="bg-primary transition-all"
                          style={{ 
                            width: `${(taskCounts.total_completed / taskCounts.total_assigned) * 100}%` 
                          }}
                          title={`Completed: ${taskCounts.total_completed}`}
                        />
                      )}
                      {/* Pending segment (yellow) */}
                      {taskCounts.total_pending > 0 && (
                        <div
                          className="bg-muted-foreground/50 transition-all"
                          style={{ 
                            width: `${(taskCounts.total_pending / taskCounts.total_assigned) * 100}%` 
                          }}
                          title={`Pending: ${taskCounts.total_pending}`}
                        />
                      )}
                      {/* Work-In-Progress segment (blue) */}
                      {taskCounts.total_in_progress > 0 && (
                        <div
                          className="bg-muted-foreground/30 transition-all"
                          style={{ 
                            width: `${(taskCounts.total_in_progress / taskCounts.total_assigned) * 100}%` 
                          }}
                          title={`Work-In-Progress: ${taskCounts.total_in_progress}`}
                        />
                      )}
                      {/* Pending Review segment (cyan/teal) */}
                      {taskCounts.total_pending_review > 0 && (
                        <div
                          className="bg-cyan-600 dark:bg-cyan-500 transition-all"
                          style={{ 
                            width: `${(taskCounts.total_pending_review / taskCounts.total_assigned) * 100}%` 
                          }}
                          title={`Pending Review: ${taskCounts.total_pending_review}`}
                        />
                      )}
                      {/* Closed segment (gray) */}
                      {taskCounts.total_archived > 0 && (
                        <div
                          className="bg-gray-600 dark:bg-gray-500 transition-all"
                          style={{ 
                            width: `${(taskCounts.total_archived / taskCounts.total_assigned) * 100}%` 
                          }}
                          title={`Closed: ${taskCounts.total_archived}`}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="w-full h-2 rounded-full bg-muted/30"></div>
                  )}
                </div>
              </>
            ) : (
              <div className="py-4">
                <p className="text-xs text-muted-foreground text-center">Loading stats...</p>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
});

UserCard.displayName = 'UserCard';

export function Users() {
  const { permissions } = useAuth();
  const { setActionButton } = usePage();
  const navigate = useNavigate();
  const { users, loading, error: fetchError, refetch } = useRealtimeUsers(permissions.canViewAllUsers ?? false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(12); // 3 columns × 4 rows = 12 cards per page
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<CreateUserResult | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    fullName: '',
    role: 'user' as UserRole,
    password: '',
    generatePassword: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<{
    email: string;
    fullName: string;
    role: UserRole;
  } | null>(null);
  const [resettingPassword, setResettingPassword] = useState<string | null>(null);
  const [resetPasswordResult, setResetPasswordResult] = useState<ResetPasswordResult | null>(null);
  const [userTaskCounts, setUserTaskCounts] = useState<Map<string, UserTaskCounts>>(new Map());

  // Set action button in top bar
  useEffect(() => {
    if (permissions.canViewAllUsers) {
      setActionButton(
        <>
          {/* Mobile: Icon button */}
          <Button 
            onClick={() => {
              setShowCreateForm((prev) => !prev);
              setCreatedCredentials(null);
              setError(null);
            }}
            size="icon"
            variant="ghost"
            className="h-10 w-10 p-0 lg:hidden"
          >
            {showCreateForm ? (
              <X className="h-8 w-8" />
            ) : (
              <Plus className="h-8 w-8" />
            )}
          </Button>
          {/* Desktop: Full button with text */}
          <Button 
            onClick={() => {
              setShowCreateForm((prev) => !prev);
              setCreatedCredentials(null);
              setError(null);
            }}
            className="hidden lg:flex min-h-[44px]"
          >
            {showCreateForm ? 'Cancel' : 'Create User'}
          </Button>
        </>
      );
    } else {
      setActionButton(null);
    }
    
    return () => setActionButton(null);
  }, [permissions.canViewAllUsers, showCreateForm, setActionButton]);

  // Fetch task counts for all users
  useEffect(() => {
    if (users.length > 0 && permissions.canViewAllUsers) {
      fetchAllUserTaskCounts();
    }
  }, [users, permissions.canViewAllUsers]);

  const fetchAllUserTaskCounts = async () => {
    const newCounts = new Map<string, UserTaskCounts>();

    // Fetch counts for all users in parallel
    const countPromises = users.map(async (u) => {
      const { data, error: countError } = await getUserTaskCounts(u.id);
      if (!countError && data) {
        newCounts.set(u.id, data);
      }
    });

    await Promise.all(countPromises);
    setUserTaskCounts(newCounts);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!permissions.canViewAllUsers) return;

    setError(null);
    setCreating(true);

    try {
      const result = await createUser({
        email: formData.email,
        fullName: formData.fullName,
        role: formData.role,
        password: formData.generatePassword ? undefined : formData.password,
      });

      if (result.error) {
        setError(result.error.message);
        setCreating(false);
        return;
      }

      // Show credentials to admin
      setCreatedCredentials(result);
      setFormData({
        email: '',
        fullName: '',
        role: UserRole.USER,
        password: '',
        generatePassword: true,
      });
      setShowCreateForm(false);
      
      // Refresh user list - the new user will be included
      // We do a full refresh here since we don't have the full user object from createUser
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleStatusToggle = async (userId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;

    try {
      await toggleUserStatus(userId, newStatus);
      refetch().catch(console.error);
    } catch (err) {
      console.error('Error updating user status:', err);
      refetch();
      alert('Failed to update user status');
    }
  };

  const handleEditUser = (user: UserWithRole) => {
    const role = (user as any).roles as { name: string } | null;
    setEditingUserId(user.id);
    setEditFormData({
      email: user.email,
      fullName: user.full_name ?? '',
      role: (role?.name as UserRole) ?? 'user',
    });
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditFormData(null);
    setError(null);
  };

  const handleSaveEdit = async () => {
    if (!editingUserId || !editFormData) return;

    try {
      setError(null);
      const { error: updateError } = await updateUser({
        userId: editingUserId,
        email: editFormData.email,
        fullName: editFormData.fullName,
        role: editFormData.role,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setEditingUserId(null);
      setEditFormData(null);
      refetch().catch(console.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const handleViewPerformance = (userId: string) => {
    navigate(`/users/${userId}/performance`);
  };

  const handleResetPassword = async (userId: string) => {
    if (!confirm('Are you sure you want to reset this user\'s password? A new password will be generated.')) {
      return;
    }

    try {
      setResettingPassword(userId);
      setError(null);
      setResetPasswordResult(null); // Clear previous result
      const result = await resetUserPassword(userId);

      console.log('Password reset result:', result); // Debug log

      // Always set the result if we have a password, even if there's an error
      // (error might indicate Edge Function wasn't used, but password is still generated)
      if (result.password) {
        setResetPasswordResult(result);
        // Scroll to the result card
        setTimeout(() => {
          const card = document.querySelector('[data-password-reset-card]');
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 100);
      } else if (result.error) {
        setError(result.error.message);
      } else {
        setError('Failed to generate password');
      }

      setResettingPassword(null);
    } catch (err) {
      console.error('Password reset error:', err); // Debug log
      setError(err instanceof Error ? err.message : 'Failed to reset password');
      setResettingPassword(null);
    }
  };

  if (!permissions.canViewAllUsers) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">You don't have permission to view this page.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 md:space-y-6 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <Skeleton height={32} width="30%" variant="text" />
          <Skeleton height={40} width={140} variant="rectangular" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonUserCard key={i} showActions={true} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 w-full max-w-full overflow-x-hidden">
      {fetchError && (
        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {fetchError.message}
        </div>
      )}
      {createdCredentials && (
        <Card className="border-2 border-primary">
          <CardHeader>
            <CardTitle>User Created Successfully</CardTitle>
            <CardDescription>
              Share these credentials with the user securely
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <Label>Email</Label>
              <p className="font-mono text-sm bg-muted p-2 rounded">{createdCredentials.email}</p>
            </div>
            <div>
              <Label>Password</Label>
              <p className="font-mono text-sm bg-muted p-2 rounded">{createdCredentials.password}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(
                  `Email: ${createdCredentials.email}\nPassword: ${createdCredentials.password}`
                );
                alert('Credentials copied to clipboard');
              }}
            >
              Copy Credentials
            </Button>
            <Button
              variant="ghost"
              onClick={() => setCreatedCredentials(null)}
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {resetPasswordResult && (
        <Card className="border-2 border-primary" data-password-reset-card>
          <CardHeader>
            <CardTitle>Password Reset</CardTitle>
            <CardDescription>
              New password generated. Share this with the user securely.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>New Password</Label>
              {resetPasswordResult.password ? (
                <p className="font-mono text-sm bg-muted p-2 rounded">{resetPasswordResult.password}</p>
              ) : (
                <div className="bg-muted border border-border rounded-md p-3">
                  <p className="text-xs text-foreground font-medium">
                    ⚠️ Password not generated. Check console for details.
                  </p>
                </div>
              )}
            </div>
            {resetPasswordResult.error && (
              <div className="bg-muted border border-border rounded-md p-3">
                <p className="text-xs text-foreground font-medium mb-1">
                  ⚠️ Edge Function Issue
                </p>
                <p className="text-xs text-muted-foreground">
                  {resetPasswordResult.error.message}
                </p>
                {resetPasswordResult.error.message.includes('not reachable') && (
                  <p className="text-xs text-muted-foreground mt-2">
                    To set this password manually, go to Supabase Dashboard → Authentication → Users → 
                    Find the user → Click "Reset Password" or update manually.
                  </p>
                )}
                {resetPasswordResult.error.message.includes('Edge Function error') && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Check the browser console for more details. The password above was generated but may not be set in auth.users.
                  </p>
                )}
              </div>
            )}
            {!resetPasswordResult.error && (
<div className="bg-muted border border-border rounded-md p-3">
                  <p className="text-xs text-foreground font-medium">
                  ✓ Password reset successfully via Edge Function
                </p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(resetPasswordResult.password);
                  alert('Password copied to clipboard');
                }}
              >
                Copy Password
              </Button>
              <Button
                variant="ghost"
                onClick={() => setResetPasswordResult(null)}
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New User</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="John Doe"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  id="role"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                >
                  <option value="user">User (Staff)</option>
                  <option value="admin">Admin (Task Capturer/Uploader)</option>
                  <option value="super_admin">Super Admin</option>
                </Select>
                <p className="text-xs text-muted-foreground">
                  User: Cannot assign tasks. Admin: Can capture and assign tasks. Super Admin: Full access.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="generatePassword"
                    checked={formData.generatePassword}
                    onChange={(e) => setFormData({ ...formData, generatePassword: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="generatePassword" className="cursor-pointer">
                    Generate random password
                  </Label>
                </div>
                {!formData.generatePassword && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Enter password"
                      required={!formData.generatePassword}
                      minLength={6}
                    />
                  </div>
                )}
              </div>
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  {error}
                </div>
              )}
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Create User'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {users.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-center text-muted-foreground py-8">No users found</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
            {users
              .slice((currentPage - 1) * pageSize, currentPage * pageSize)
              .map((user) => (
                <UserCard
                  key={user.id}
                  user={user}
                  editingUserId={editingUserId}
                  editFormData={editFormData}
                  resettingPassword={resettingPassword}
                  taskCounts={userTaskCounts.get(user.id) ?? null}
                  onEdit={handleEditUser}
                  onCancelEdit={handleCancelEdit}
                  onSaveEdit={handleSaveEdit}
                  onStatusToggle={handleStatusToggle}
                  onResetPassword={handleResetPassword}
                  onUserDeleted={() => refetch()}
                  onViewPerformance={handleViewPerformance}
                  setEditFormData={setEditFormData}
                />
              ))}
          </div>
          {users.length > pageSize && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-6 pt-4 border-t">
              <div className="text-sm text-muted-foreground text-center sm:text-left">
                Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, users.length)} of {users.length} users
              </div>
              <div className="flex gap-2 justify-center sm:justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="min-h-[44px] min-w-[80px]"
                >
                  Previous
                </Button>
                <span className="flex items-center px-3 text-sm">
                  Page {currentPage} of {Math.ceil(users.length / pageSize)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(Math.ceil(users.length / pageSize), p + 1))}
                  disabled={currentPage >= Math.ceil(users.length / pageSize)}
                  className="min-h-[44px] min-w-[80px]"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
