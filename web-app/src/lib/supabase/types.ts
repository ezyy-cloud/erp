// TypeScript types for Supabase database
// These will be generated from your Supabase schema
// For now, defining manually based on the schema

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      roles: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role_id: string | null;
          is_active: boolean;
          deleted_at: string | null; // Soft delete timestamp
          deleted_by: string | null; // User who soft-deleted this user
          theme_preference: string | null; // 'light', 'dark', or 'system'
          avatar_url: string | null; // URL to profile avatar image
          email_notifications_enabled: boolean | null; // When false, skip notification emails
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          full_name?: string | null;
          role_id?: string | null;
          is_active?: boolean;
          deleted_at?: string | null;
          deleted_by?: string | null;
          theme_preference?: string | null;
          avatar_url?: string | null;
          email_notifications_enabled?: boolean | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role_id?: string | null;
          is_active?: boolean;
          deleted_at?: string | null;
          deleted_by?: string | null;
          theme_preference?: string | null;
          avatar_url?: string | null;
          email_notifications_enabled?: boolean | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
      };
      projects: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          status: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
      };
      project_members: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          role: string;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          role?: string;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          project_id?: string;
          user_id?: string;
          role?: string;
          created_at?: string;
          created_by?: string | null;
        };
      };
      tasks: {
        Row: {
          id: string;
          project_id: string | null; // Nullable: allows standalone tasks not associated with any project
          title: string;
          description: string | null;
          status: string; // DEPRECATED: Use task_status instead
          task_status: string; // Canonical lifecycle state: 'ToDo', 'Work-In-Progress', 'Done', 'Closed'
          assigned_to: string | null; // DEPRECATED: Use task_assignees table
          due_date: string | null;
          priority: string;
          review_status: string | null; // DEPRECATED: Review state is now part of task_status
          review_requested_by: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          review_comments: string | null;
          review_requested_at: string | null;
          archived_at: string | null; // Timestamp when task was closed/archived
          archived_by: string | null; // User who closed/archived the task
          closed_reason: string | null; // 'manual' or 'project_closed'
          closed_at: string | null;
          status_before_closure: string | null; // Status before closure, used for reopening
          deleted_at: string | null; // Soft delete timestamp
          deleted_by: string | null; // User who soft-deleted the task
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          project_id?: string | null; // Optional: can be null for standalone tasks
          title: string;
          description?: string | null;
          status?: string; // DEPRECATED
          task_status?: string; // Defaults to 'ToDo' for new tasks
          assigned_to?: string | null;
          due_date?: string | null;
          priority?: string;
          review_status?: string | null; // DEPRECATED
          review_requested_by?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          review_comments?: string | null;
          review_requested_at?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          closed_reason?: string | null;
          closed_at?: string | null;
          status_before_closure?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          project_id?: string | null; // Can be set to null to make task standalone
          title?: string;
          description?: string | null;
          status?: string; // DEPRECATED
          task_status?: string; // Use lifecycle functions instead of direct updates
          assigned_to?: string | null;
          due_date?: string | null;
          priority?: string;
          review_status?: string | null; // DEPRECATED
          review_requested_by?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          review_comments?: string | null;
          review_requested_at?: string | null;
          archived_at?: string | null;
          archived_by?: string | null;
          closed_reason?: string | null;
          closed_at?: string | null;
          status_before_closure?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
      };
      task_edit_requests: {
        Row: {
          id: string;
          task_id: string;
          requested_by: string;
          proposed_changes: Record<string, unknown>; // JSONB
          status: 'pending' | 'approved' | 'rejected';
          reviewed_by: string | null;
          reviewed_at: string | null;
          comments: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          requested_by: string;
          proposed_changes: Record<string, unknown>;
          status?: 'pending' | 'approved' | 'rejected';
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          comments?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          requested_by?: string;
          proposed_changes?: Record<string, unknown>;
          status?: 'pending' | 'approved' | 'rejected';
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          comments?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      task_assignees: {
        Row: {
          id: string;
          task_id: string;
          user_id: string;
          assigned_at: string;
          assigned_by: string | null;
        };
        Insert: {
          id?: string;
          task_id: string;
          user_id: string;
          assigned_at?: string;
          assigned_by?: string | null;
        };
        Update: {
          id?: string;
          task_id?: string;
          user_id?: string;
          assigned_at?: string;
          assigned_by?: string | null;
        };
      };
      notifications: {
        Row: {
          id: string;
          recipient_user_id: string;
          type: string;
          title: string;
          message: string;
          related_entity_type: string | null;
          related_entity_id: string | null;
          is_read: boolean;
          created_at: string;
          read_at: string | null;
        };
        Insert: {
          id?: string;
          recipient_user_id: string;
          type: string;
          title: string;
          message: string;
          related_entity_type?: string | null;
          related_entity_id?: string | null;
          is_read?: boolean;
          created_at?: string;
          read_at?: string | null;
        };
        Update: {
          id?: string;
          recipient_user_id?: string;
          type?: string;
          title?: string;
          message?: string;
          related_entity_type?: string | null;
          related_entity_id?: string | null;
          is_read?: boolean;
          created_at?: string;
          read_at?: string | null;
        };
      };
      task_comments: {
        Row: {
          id: string;
          task_id: string;
          user_id: string;
          content: string;
          parent_comment_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          user_id: string;
          content: string;
          parent_comment_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          user_id?: string;
          content?: string;
          parent_comment_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      task_notes: {
        Row: {
          id: string;
          task_id: string;
          user_id: string;
          content: string;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          user_id: string;
          content: string;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          user_id?: string;
          content?: string;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      task_files: {
        Row: {
          id: string;
          task_id: string;
          user_id: string;
          file_name: string;
          file_path: string;
          file_size: number | null;
          mime_type: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          task_id: string;
          user_id: string;
          file_name: string;
          file_path: string;
          file_size?: number | null;
          mime_type?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          task_id?: string;
          user_id?: string;
          file_name?: string;
          file_path?: string;
          file_size?: number | null;
          mime_type?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
      };
      task_progress_log: {
        Row: {
          id: string;
          task_id: string;
          user_id: string;
          status: string;
          progress_note: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          task_id: string;
          user_id: string;
          status: string;
          progress_note?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          task_id?: string;
          user_id?: string;
          status?: string;
          progress_note?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
      };
      bulletins: {
        Row: {
          id: string;
          title: string;
          body: string;
          creator_id: string;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          body: string;
          creator_id: string;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          title?: string;
          body?: string;
          creator_id?: string;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
      };
      todo_items: {
        Row: {
          id: string;
          text: string;
          creator_id: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          text: string;
          creator_id: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          text?: string;
          creator_id?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
      };
      todo_assignees: {
        Row: {
          id: string;
          todo_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          todo_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          todo_id?: string;
          user_id?: string;
          created_at?: string;
        };
      };
      todo_completions: {
        Row: {
          id: string;
          todo_id: string;
          user_id: string;
          completed_at: string;
        };
        Insert: {
          id?: string;
          todo_id: string;
          user_id: string;
          completed_at?: string;
        };
        Update: {
          id?: string;
          todo_id?: string;
          user_id?: string;
          completed_at?: string;
        };
      };
    };
    Views: {
      [key: string]: never;
    };
    Functions: {
      create_my_user_record: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      sync_missing_user_records: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      create_review_requested_notification: {
        Args: {
          p_task_id: string;
          p_requested_by: string;
        };
        Returns: unknown;
      };
      create_review_completed_notification: {
        Args: {
          p_task_id: string;
          p_reviewed_by: string;
          p_status: string;
        };
        Returns: unknown;
      };
      create_project_change_notification: {
        Args: {
          p_project_id: string;
          p_change_type: string;
          p_changed_by: string | null;
        };
        Returns: unknown;
      };
      get_user_dashboard_stats: {
        Args: {
          p_user_id: string;
        };
        Returns: {
          total_tasks: number;
          completed_tasks: number;
          in_progress_tasks: number;
          overdue_tasks: number;
          tasks_awaiting_review: number;
        };
      };
      get_user_task_status_distribution: {
        Args: {
          p_user_id: string;
        };
        Returns: Array<{
          status: string;
          count: number;
        }>;
      };
      get_user_upcoming_tasks: {
        Args: {
          p_user_id: string;
        };
        Returns: Array<Database['public']['Tables']['tasks']['Row']>;
      };
      get_admin_dashboard_stats: {
        Args: {
          p_user_id: string;
        };
        Returns: {
          total_projects: number;
          active_projects: number;
          total_tasks: number;
          completed_tasks: number;
          total_users: number;
          active_users: number;
        };
      };
      close_project_with_cascade: {
        Args: {
          p_project_id: string;
        };
        Returns: {
          success: boolean;
          project_id: string;
          closed_tasks_count: number;
          error?: string;
        };
      };
      reopen_project_with_reactivate: {
        Args: {
          p_project_id: string;
        };
        Returns: {
          success: boolean;
          project_id: string;
          reactivated_tasks_count: number;
          error?: string;
        };
      };
      is_task_closed: {
        Args: {
          p_task_id: string;
        };
        Returns: boolean;
      };
      get_project_health_summary: {
        Args: {
          p_user_id: string;
        };
        Returns: Array<{
          project_id: string;
          project_name: string;
          project_status: string;
          total_tasks: number;
          open_tasks: number;
          overdue_tasks: number;
          closed_tasks: number;
          completion_percentage: number;
        }>;
      };
      get_user_workload_summary: {
        Args: {
          p_user_id: string;
        };
        Returns: Array<{
          user_id: string;
          user_name: string;
          user_email: string;
          user_role: string;
          assigned_tasks: number;
          overdue_tasks: number;
          tasks_waiting_review: number;
        }>;
      };
      get_task_urgency_summary: {
        Args: {
          p_user_id: string;
        };
        Returns: Array<{
          status: string;
          overdue_count: number;
          due_today_count: number;
          due_soon_count: number;
          total_count: number;
        }>;
      };
      apply_task_edit_request: {
        Args: {
          request_id: string;
          reviewed_by: string;
        };
        Returns: {
          success: boolean;
          message?: string;
          error?: string;
        };
      };
      soft_delete_task: {
        Args: {
          task_id: string;
          deleted_by: string;
        };
        Returns: {
          success: boolean;
          message?: string;
          error?: string;
        };
      };
      restore_task: {
        Args: {
          task_id: string;
          restored_by: string;
        };
        Returns: {
          success: boolean;
          message?: string;
          error?: string;
        };
      };
      soft_delete_user: {
        Args: {
          user_id: string;
          deleted_by: string;
          reassign_tasks_to?: string | null;
        };
        Returns: {
          success: boolean;
          message?: string;
          error?: string;
          tasks_reassigned?: number;
          tasks_orphaned?: number;
        };
      };
      restore_user: {
        Args: {
          user_id: string;
          restored_by: string;
        };
        Returns: {
          success: boolean;
          message?: string;
          error?: string;
        };
      };
    };
    Enums: {
      [key: string]: never;
    };
    CompositeTypes: {
      [key: string]: never;
    };
  };
}

// Helper types for easier usage
export type Role = Database['public']['Tables']['roles']['Row'];
export type User = Database['public']['Tables']['users']['Row'];
export type Project = Database['public']['Tables']['projects']['Row'];
export type ProjectMember = Database['public']['Tables']['project_members']['Row'];
export type Task = Database['public']['Tables']['tasks']['Row'];
export type TaskComment = Database['public']['Tables']['task_comments']['Row'];
export type TaskNote = Database['public']['Tables']['task_notes']['Row'];
export type TaskFile = Database['public']['Tables']['task_files']['Row'];
export type TaskProgressLog = Database['public']['Tables']['task_progress_log']['Row'];
export type TaskEditRequest = Database['public']['Tables']['task_edit_requests']['Row'];
export type TaskAssignee = Database['public']['Tables']['task_assignees']['Row'];
export type Notification = Database['public']['Tables']['notifications']['Row'];
export type Bulletin = Database['public']['Tables']['bulletins']['Row'];
export type TodoItem = Database['public']['Tables']['todo_items']['Row'];
export type TodoAssignee = Database['public']['Tables']['todo_assignees']['Row'];
export type TodoCompletion = Database['public']['Tables']['todo_completions']['Row'];

// Extended types with relations
export type UserWithRole = User & {
  roles?: Role;
};

// Extended task type with assignees
export type TaskWithAssignees = Task & {
  assignees?: (TaskAssignee & { user?: UserWithRole })[];
};

// Proposed changes type for edit requests
export interface ProposedTaskChanges {
  title?: string;
  description?: string | null;
  due_date?: string | null;
  priority?: string;
  assignees?: string[]; // Array of user IDs
}

// Constants for type safety (using const objects instead of enums for erasableSyntaxOnly compatibility)
// DEPRECATED: Old status values - kept for backward compatibility
export const TaskStatus = {
  TO_DO: 'to_do',
  IN_PROGRESS: 'in_progress',
  BLOCKED: 'blocked',
  DONE: 'done',
  CLOSED: 'closed', // Task closed - read-only for users
} as const;

export type TaskStatus = typeof TaskStatus[keyof typeof TaskStatus];

// Canonical Task Lifecycle States (Single Source of Truth)
export const TaskLifecycleStatus = {
  TODO: 'ToDo',
  WORK_IN_PROGRESS: 'Work-In-Progress',
  DONE: 'Done', // Pending Review
  CLOSED: 'Closed', // Complete - Passed Review
} as const;

export type TaskLifecycleStatus = typeof TaskLifecycleStatus[keyof typeof TaskLifecycleStatus];

export const TaskPriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
} as const;

export type TaskPriority = typeof TaskPriority[keyof typeof TaskPriority];

export const UserRole = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  USER: 'user',
} as const;

export type UserRole = typeof UserRole[keyof typeof UserRole];

export const ProjectStatus = {
  ACTIVE: 'active',
  CLOSED: 'closed', // Project closed - cascades to tasks
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const;

export type ProjectStatus = typeof ProjectStatus[keyof typeof ProjectStatus];

export const TaskReviewStatus = {
  NONE: 'none',
  PENDING_REVIEW: 'pending_review',
  UNDER_REVIEW: 'under_review',
  REVIEWED_APPROVED: 'reviewed_approved',
  CHANGES_REQUESTED: 'changes_requested',
} as const;

export type TaskReviewStatus = typeof TaskReviewStatus[keyof typeof TaskReviewStatus];

export const NotificationType = {
  TASK_ASSIGNED: 'task_assigned',
  TASK_DUE_SOON: 'task_due_soon',
  TASK_OVERDUE: 'task_overdue',
  REVIEW_REQUESTED: 'review_requested',
  REVIEW_COMPLETED: 'review_completed',
  COMMENT_ADDED: 'comment_added',
  DOCUMENT_UPLOADED: 'document_uploaded',
  TODO_COMPLETED: 'todo_completed',
  BULLETIN_POSTED: 'bulletin_posted',
} as const;

export type NotificationType = typeof NotificationType[keyof typeof NotificationType];
