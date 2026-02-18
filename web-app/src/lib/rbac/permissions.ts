import { UserRole } from '@/lib/supabase/types';

/**
 * RBAC Permission System
 * 
 * Defines what each role can do in the application.
 * This is enforced at:
 * - UI level (what is shown/hidden)
 * - API level (what operations are allowed)
 * - Database level (RLS policies)
 * 
 * Role Hierarchy:
 * 1. Super Admin - System owner, can manage everything, can assign tasks, can be assigned tasks
 * 2. Admin (Uploader/Task Capturer) - Captures tasks, assigns tasks to users, can be assigned tasks
 * 3. User (Staff) - Cannot assign tasks, can view assigned tasks, add comments, notes, upload documents, request reviews
 */

export interface Permissions {
  // Projects
  canViewAllProjects: boolean;
  canCreateProjects: boolean;
  canEditProjects: boolean;
  canDeleteProjects: boolean;
  
  // Tasks
  canViewAllTasks: boolean;
  canCreateTasks: boolean;
  canEditTasks: boolean;
  canAssignTasks: boolean;
  canDeleteTasks: boolean; // Super Admin can soft delete tasks
  
  // Task Interactions
  canAddComments: boolean;
  canDeleteComments: boolean;
  canAddNotes: boolean;
  canUploadFiles: boolean;
  
  // Task Status Updates
  canUpdateTaskStatus: boolean;
  
  // Task Review
  canRequestReview: boolean;
  canReviewTasks: boolean;
  
  // Task Archive
  canArchiveTasks: boolean; // Super Admin can archive tasks
  canUnarchiveTasks: boolean; // Super Admin can unarchive tasks
  canViewArchivedTasks: boolean; // Super Admin can view archived tasks
  
  // Task Edit Requests
  canRequestTaskEdit: boolean; // Admin can request edits
  canApproveTaskEdits: boolean; // Super Admin can approve/reject
  
  // Deletion
  canDeleteUsers: boolean; // Super Admin can soft delete users
  canViewDeletedTasks: boolean; // Super Admin can view deleted tasks
  canViewDeletedUsers: boolean; // Super Admin can view deleted users
  
  // Users
  canViewAllUsers: boolean;
  canManageUsers: boolean;
  
  // Reports (future-ready)
  canViewReports: boolean;

  // Bulletins & To-Dos
  canManageBulletins: boolean;
  canManageTodos: boolean;
}

/**
 * Get permissions for a given role
 */
/**
 * Get permissions for a given role
 * 
 * Role Descriptions:
 * - SUPER_ADMIN: System owner, can manage everything, can assign tasks, can be assigned tasks themselves
 * - ADMIN: Task capturer/uploader, responsible for capturing tasks and assigning them to users, can also be assigned tasks
 * - USER: Staff member, cannot assign tasks, can view assigned tasks, add comments/notes, upload documents, request reviews
 */
export function getPermissions(roleName: string | null): Permissions {
  switch (roleName) {
    case UserRole.SUPER_ADMIN:
      // Super Admin: Full system access, can approve edits and delete
      return {
        canViewAllProjects: true,
        canCreateProjects: true,
        canEditProjects: true,
        canDeleteProjects: true,
        canViewAllTasks: true,
        canCreateTasks: true,
        canEditTasks: true, // Super Admin can edit directly (still audited via edit requests)
        canAssignTasks: true, // Can assign tasks to anyone including themselves
        canDeleteTasks: true, // Super Admin can soft delete tasks
        canAddComments: true,
        canDeleteComments: true,
        canAddNotes: true,
        canUploadFiles: true,
        canRequestReview: true,
        canReviewTasks: true, // Only Super Admin can review
        canArchiveTasks: true, // Super Admin can archive tasks
        canUnarchiveTasks: true, // Super Admin can unarchive tasks
        canViewArchivedTasks: true, // Super Admin can view archived tasks
        canRequestTaskEdit: true, // Can request edits
        canApproveTaskEdits: true, // Can approve/reject edit requests
        canDeleteUsers: true, // Super Admin can soft delete users
        canViewDeletedTasks: true, // Can view deleted tasks for restore
        canViewDeletedUsers: true, // Can view deleted users for restore
        canViewAllUsers: true,
        canManageUsers: false, // System-level permissions not changeable
        canViewReports: true,
        canUpdateTaskStatus: true,
        canManageBulletins: true,
        canManageTodos: true,
      };
      
    case UserRole.ADMIN:
      // Admin (Task Capturer/Uploader): Can capture tasks, assign tasks, can be assigned tasks
      return {
        canViewAllProjects: true,
        canCreateProjects: true,
        canEditProjects: true,
        canDeleteProjects: false, // Only super_admin can delete
        canViewAllTasks: true,
        canCreateTasks: true,
        canEditTasks: false, // Tasks are immutable after creation (use edit requests)
        canAssignTasks: true, // Core responsibility: assigning tasks to users (including themselves)
        canDeleteTasks: false, // Only Super Admin can delete
        canAddComments: true,
        canDeleteComments: true,
        canAddNotes: true,
        canUploadFiles: true,
        canRequestReview: true,
        canReviewTasks: false, // Only Super Admin can review
        canArchiveTasks: false, // Only Super Admin can archive
        canUnarchiveTasks: false, // Only Super Admin can unarchive
        canViewArchivedTasks: false, // Only Super Admin can view archived
        canRequestTaskEdit: true, // Admin can request task edits
        canApproveTaskEdits: false, // Only Super Admin can approve
        canDeleteUsers: false, // Only Super Admin can delete
        canViewDeletedTasks: false, // Only Super Admin can view deleted
        canViewDeletedUsers: false, // Only Super Admin can view deleted
        canViewAllUsers: true,
        canManageUsers: false,
        canViewReports: false, // Future feature
        canUpdateTaskStatus: true,
        canManageBulletins: true,
        canManageTodos: true,
      };
      
    case UserRole.USER:
    default:
      // User (Staff): Cannot assign tasks, can work on assigned tasks
      // All users can VIEW all projects and tasks, but only assigned users can interact
      return {
        canViewAllProjects: true, // All users can view all projects
        canCreateProjects: false, // Only Admin and Super Admin can create
        canEditProjects: false,
        canDeleteProjects: false,
        canViewAllTasks: true, // All users can view all tasks
        canCreateTasks: false,
        canEditTasks: false, // Tasks are immutable after creation
        canAssignTasks: false, // Staff cannot assign tasks - this is enforced strictly
        canDeleteTasks: false, // Only Super Admin can delete
        canAddComments: true, // But only on assigned tasks (enforced at API/DB level)
        canDeleteComments: false, // Only admins can delete comments
        canAddNotes: true, // But only on assigned tasks (enforced at API/DB level)
        canUploadFiles: true, // But only on assigned tasks (enforced at API/DB level)
        canRequestReview: true, // But only on assigned tasks (enforced at API/DB level)
        canReviewTasks: false, // Only Super Admin can review
        canArchiveTasks: false, // Only Super Admin can archive
        canUnarchiveTasks: false, // Only Super Admin can unarchive
        canViewArchivedTasks: false, // Only Super Admin can view archived
        canRequestTaskEdit: false, // Only Admin and Super Admin can request edits
        canApproveTaskEdits: false, // Only Super Admin can approve
        canDeleteUsers: false, // Only Super Admin can delete
        canViewDeletedTasks: false, // Only Super Admin can view deleted
        canViewDeletedUsers: false, // Only Super Admin can view deleted
        canViewAllUsers: false,
        canManageUsers: false,
        canViewReports: false,
        canUpdateTaskStatus: true, // Users can update status on assigned tasks only
        canManageBulletins: false,
        canManageTodos: false,
      };
  }
}

/**
 * Check if user has a specific permission
 */
export function hasPermission(
  roleName: string | null,
  permission: keyof Permissions
): boolean {
  const permissions = getPermissions(roleName);
  return permissions[permission] ?? false;
}
