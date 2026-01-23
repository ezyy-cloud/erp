import { TaskStatus, TaskLifecycleStatus, TaskPriority, ProjectStatus } from '@/lib/supabase/types';
import { 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  Circle,
  PlayCircle,
  Archive,
  Activity,
  Calendar,
  CalendarCheck,
  CalendarX,
  FileCheck,
  type LucideIcon
} from 'lucide-react';

// Priority display helpers
export interface PriorityDisplay {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: LucideIcon;
}

export function getPriorityDisplay(priority: string): PriorityDisplay {
  switch (priority) {
    case TaskPriority.URGENT:
      return {
        label: 'Urgent',
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-500',
        icon: AlertCircle,
      };
    case TaskPriority.HIGH:
      return {
        label: 'High',
        color: 'text-orange-600',
        bgColor: 'bg-orange-50',
        borderColor: 'border-orange-500',
        icon: AlertTriangle,
      };
    case TaskPriority.MEDIUM:
      return {
        label: 'Medium',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-500',
        icon: Clock,
      };
    case TaskPriority.LOW:
    default:
      return {
        label: 'Low',
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-500',
        icon: Circle,
      };
  }
}

// Task status display helpers
export interface StatusDisplay {
  label: string;
  color: string;
  bgColor: string;
  icon: LucideIcon;
  description?: string; // Short explanation of what the stage means
}

/**
 * Get task status display based on canonical lifecycle
 * @param taskStatus - Canonical task lifecycle status (task_status field)
 * @param legacyStatus - Legacy status field (for backward compatibility)
 * @param archivedAt - Task archived timestamp (optional, for backward compatibility)
 */
export function getTaskStatusDisplay(
  taskStatus?: string | null,
  legacyStatus?: string | null,
  archivedAt?: string | null
): StatusDisplay {
  // Use canonical task_status if available, otherwise fall back to legacy status
  const status = taskStatus ?? legacyStatus ?? 'ToDo';

  // Canonical lifecycle states (single source of truth)
  switch (status) {
    case TaskLifecycleStatus.TODO:
      return {
        label: 'To Do',
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        icon: Circle,
        description: 'Initial state - No work has started',
      };
    case TaskLifecycleStatus.WORK_IN_PROGRESS:
      return {
        label: 'Work-In-Progress',
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        icon: PlayCircle,
        description: 'Active execution - Work has started',
      };
    case TaskLifecycleStatus.DONE:
      return {
        label: 'Done (Pending Review)',
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        icon: FileCheck,
        description: 'Work completed - Awaiting review approval',
      };
    case TaskLifecycleStatus.CLOSED:
      return {
        label: 'Closed (Complete)',
        color: 'text-gray-700',
        bgColor: 'bg-gray-200',
        icon: Archive,
        description: 'Review approved - Task is complete and read-only',
      };
    default:
      // Fallback to legacy status handling for backward compatibility
      if (archivedAt) {
        return {
          label: 'Closed',
          color: 'text-gray-700',
          bgColor: 'bg-gray-200',
          icon: Archive,
          description: 'Task is archived and read-only',
        };
      }

      switch (status) {
        case TaskStatus.TO_DO:
          return {
            label: 'To Do',
            color: 'text-gray-600',
            bgColor: 'bg-gray-100',
            icon: Circle,
            description: 'Initial state',
          };
        case TaskStatus.IN_PROGRESS:
          return {
            label: 'In Progress',
            color: 'text-blue-600',
            bgColor: 'bg-blue-100',
            icon: PlayCircle,
            description: 'Work in progress',
          };
        case TaskStatus.DONE:
          return {
            label: 'Done',
            color: 'text-green-600',
            bgColor: 'bg-green-100',
            icon: CheckCircle2,
            description: 'Task completed',
          };
        case TaskStatus.CLOSED:
          return {
            label: 'Closed',
            color: 'text-gray-700',
            bgColor: 'bg-gray-200',
            icon: Archive,
            description: 'Task closed',
          };
        default:
          return {
            label: status.replace('_', ' '),
            color: 'text-gray-600',
            bgColor: 'bg-gray-100',
            icon: Circle,
            description: 'Unknown status',
          };
      }
  }
}

// Project status display helpers
export interface ProjectStatusDisplay {
  label: string;
  color: string;
  bgColor: string;
  icon: LucideIcon;
}

export function getProjectStatusDisplay(status: string): ProjectStatusDisplay {
  switch (status) {
    case ProjectStatus.ACTIVE:
      return {
        label: 'Active',
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        icon: Activity,
      };
    case ProjectStatus.CLOSED:
      return {
        label: 'Closed',
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        icon: Archive,
      };
    case ProjectStatus.COMPLETED:
      return {
        label: 'Completed',
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        icon: CheckCircle2,
      };
    case ProjectStatus.ARCHIVED:
      return {
        label: 'Archived',
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        icon: Archive,
      };
    default:
      return {
        label: status,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        icon: Circle,
      };
  }
}

// Due date display helpers
export interface DueDateDisplay {
  label: string;
  color: string;
  bgColor: string;
  icon: LucideIcon;
  isOverdue: boolean;
  isDueSoon: boolean;
}

export function getDueDateDisplay(dueDate: string | null | undefined): DueDateDisplay | null {
  if (!dueDate) return null;

  const due = new Date(dueDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDateOnly = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  
  const diffTime = dueDateOnly.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    // Overdue
    return {
      label: `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      icon: CalendarX,
      isOverdue: true,
      isDueSoon: false,
    };
  } else if (diffDays === 0) {
    // Due today
    return {
      label: 'Due today',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      icon: Calendar,
      isOverdue: false,
      isDueSoon: true,
    };
  } else if (diffDays <= 3) {
    // Due soon (within 3 days)
    return {
      label: `Due in ${diffDays} day${diffDays === 1 ? '' : 's'}`,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      icon: CalendarCheck,
      isOverdue: false,
      isDueSoon: true,
    };
  } else {
    // Due later
    return {
      label: due.toLocaleDateString(),
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
      icon: Calendar,
      isOverdue: false,
      isDueSoon: false,
    };
  }
}
