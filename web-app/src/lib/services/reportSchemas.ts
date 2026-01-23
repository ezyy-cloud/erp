/**
 * Report Data Schemas and Validation
 * Ensures data integrity before PDF generation
 */

export interface BaseReportData {
  title: string;
  generatedBy: string;
  generatedAt: string;
  content: any;
}

export interface UserPerformanceReportData extends BaseReportData {
  content: {
    user: {
      id: string;
      full_name: string | null;
      email: string;
      created_at: string;
    };
    taskCounts: {
      total_assigned?: number;
      total_completed?: number;
      total_in_progress?: number;
      total_pending_review?: number;
    };
    tasks: Array<{
      id: string;
      title: string;
      task_status: string;
      due_date: string | null;
      created_at: string;
      priority: string | null;
    }>;
    overdueTasks: number;
    completionRate: string;
    dateRange: { from?: string; to?: string };
    projectFilter?: string;
  };
}

export interface TaskLifecycleReportData extends BaseReportData {
  content: {
    totalTasks: number;
    statusCounts: {
      ToDo: number;
      'Work-In-Progress': number;
      Done: number;
      Closed: number;
    };
    avgStageTimes: Array<{
      stage: string;
      avgDays: number;
    }>;
    reopenedCount: number;
    bottlenecks: number;
    dateRange: { from?: string; to?: string };
    projectFilter?: string;
    userFilter?: string;
  };
}

export interface ProjectReportData extends BaseReportData {
  content: {
    project: {
      id: string;
      name: string;
      description: string | null;
      status: string;
      created_at: string;
      updated_at: string;
    };
    totalTasks: number;
    statusCounts: {
      ToDo: number;
      'Work-In-Progress': number;
      Done: number;
      Closed: number;
    };
    completed: number;
    pending: number;
    userContributions: Record<string, number>;
    dateRange: { from?: string; to?: string };
  };
}

export interface CompanyWideReportData extends BaseReportData {
  content: {
    totalUsers: number;
    totalProjects: number;
    totalTasks: number;
    statusCounts: {
      ToDo: number;
      'Work-In-Progress': number;
      Done: number;
      Closed: number;
    };
    mostActiveUsers: Array<{ name: string; taskCount: number }>;
    overdueCount: number;
    pendingReviewCount: number;
    dateRange: { from?: string; to?: string };
  };
}

export type ValidatedReportData = 
  | UserPerformanceReportData 
  | TaskLifecycleReportData 
  | ProjectReportData 
  | CompanyWideReportData;

/**
 * Validate report data before PDF generation
 */
export function validateReportData(data: BaseReportData): {
  valid: boolean;
  error?: string;
  validatedData?: ValidatedReportData;
} {
  if (!data.title || !data.generatedBy || !data.generatedAt || !data.content) {
    return {
      valid: false,
      error: 'Missing required report metadata (title, generatedBy, generatedAt, or content)',
    };
  }

  const title = data.title.toLowerCase();

  // User Performance Report validation
  if (title.includes('user performance')) {
    const content = data.content as UserPerformanceReportData['content'];
    if (!content.user || !content.user.id || !content.user.email) {
      return {
        valid: false,
        error: 'User Performance Report: Missing user data',
      };
    }
    if (content.taskCounts === undefined) {
      return {
        valid: false,
        error: 'User Performance Report: Missing task counts',
      };
    }
    return { valid: true, validatedData: data as UserPerformanceReportData };
  }

  // Task Lifecycle Report validation
  if (title.includes('task lifecycle')) {
    const content = data.content as TaskLifecycleReportData['content'];
    if (content.totalTasks === undefined || content.statusCounts === undefined) {
      return {
        valid: false,
        error: 'Task Lifecycle Report: Missing totalTasks or statusCounts',
      };
    }
    return { valid: true, validatedData: data as TaskLifecycleReportData };
  }

  // Project Report validation
  if (title.includes('project report')) {
    const content = data.content as ProjectReportData['content'];
    if (!content.project || !content.project.id || !content.project.name) {
      return {
        valid: false,
        error: 'Project Report: Missing project data',
      };
    }
    if (content.totalTasks === undefined || content.statusCounts === undefined) {
      return {
        valid: false,
        error: 'Project Report: Missing totalTasks or statusCounts',
      };
    }
    return { valid: true, validatedData: data as ProjectReportData };
  }

  // Company-Wide Report validation
  if (title.includes('company-wide') || title.includes('executive')) {
    const content = data.content as CompanyWideReportData['content'];
    if (
      content.totalUsers === undefined ||
      content.totalProjects === undefined ||
      content.totalTasks === undefined ||
      content.statusCounts === undefined
    ) {
      return {
        valid: false,
        error: 'Company-Wide Report: Missing required metrics',
      };
    }
    return { valid: true, validatedData: data as CompanyWideReportData };
  }

  return {
    valid: false,
    error: `Unknown report type: ${data.title}`,
  };
}

/**
 * Calculate summary metrics for executive summary
 */
export function calculateSummaryMetrics(data: ValidatedReportData): {
  status: 'healthy' | 'warning' | 'critical';
  keyMetrics: Array<{ label: string; value: string | number; trend?: string }>;
  riskIndicators: Array<{ label: string; severity: 'low' | 'medium' | 'high' }>;
} {
  const title = data.title.toLowerCase();
  const keyMetrics: Array<{ label: string; value: string | number; trend?: string }> = [];
  const riskIndicators: Array<{ label: string; severity: 'low' | 'medium' | 'high' }> = [];
  let status: 'healthy' | 'warning' | 'critical' = 'healthy';

  if (title.includes('user performance')) {
    const content = (data as UserPerformanceReportData).content;
    const total = content.taskCounts.total_assigned ?? 0;
    const completed = content.taskCounts.total_completed ?? 0;
    const overdue = content.overdueTasks;
    const completionRate = parseFloat(content.completionRate);

    keyMetrics.push(
      { label: 'Total Tasks', value: total },
      { label: 'Completed', value: completed },
      { label: 'Completion Rate', value: `${completionRate.toFixed(1)}%` },
      { label: 'Overdue Tasks', value: overdue }
    );

    if (overdue > 0) riskIndicators.push({ label: `${overdue} overdue task(s)`, severity: overdue > 5 ? 'high' : 'medium' });
    if (completionRate < 50) {
      riskIndicators.push({ label: 'Low completion rate', severity: 'medium' });
      status = 'warning';
    }
    if (overdue > 10 || completionRate < 30) status = 'critical';
  } else if (title.includes('task lifecycle')) {
    const content = (data as TaskLifecycleReportData).content;
    const total = content.totalTasks;
    const bottlenecks = content.bottlenecks;
    const reopened = content.reopenedCount;

    keyMetrics.push(
      { label: 'Total Tasks', value: total },
      { label: 'Bottlenecks', value: bottlenecks },
      { label: 'Reopened Tasks', value: reopened }
    );

    if (bottlenecks > 0) {
      riskIndicators.push({ label: `${bottlenecks} task(s) pending review > 7 days`, severity: bottlenecks > 5 ? 'high' : 'medium' });
      status = bottlenecks > 5 ? 'critical' : 'warning';
    }
    if (reopened > total * 0.1) {
      riskIndicators.push({ label: 'High task reopening rate', severity: 'medium' });
      if (status === 'healthy') status = 'warning';
    }
  } else if (title.includes('project report')) {
    const content = (data as ProjectReportData).content;
    const total = content.totalTasks;
    const completed = content.completed;
    const pending = content.pending;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    keyMetrics.push(
      { label: 'Total Tasks', value: total },
      { label: 'Completed', value: completed },
      { label: 'Pending', value: pending },
      { label: 'Completion Rate', value: `${completionRate.toFixed(1)}%` }
    );

    if (pending > total * 0.5) {
      riskIndicators.push({ label: 'High pending task ratio', severity: 'medium' });
      status = 'warning';
    }
    if (completionRate < 30) {
      riskIndicators.push({ label: 'Low project completion rate', severity: 'high' });
      status = 'critical';
    }
  } else if (title.includes('company-wide') || title.includes('executive')) {
    const content = (data as CompanyWideReportData).content;
    const overdue = content.overdueCount;
    const pendingReview = content.pendingReviewCount;
    const totalTasks = content.totalTasks;
    const overdueRate = totalTasks > 0 ? (overdue / totalTasks) * 100 : 0;

    keyMetrics.push(
      { label: 'Total Users', value: content.totalUsers },
      { label: 'Total Projects', value: content.totalProjects },
      { label: 'Total Tasks', value: totalTasks },
      { label: 'Overdue Tasks', value: overdue },
      { label: 'Pending Review', value: pendingReview }
    );

    if (overdue > 0) {
      riskIndicators.push({
        label: `${overdue} overdue task(s) (${overdueRate.toFixed(1)}%)`,
        severity: overdueRate > 10 ? 'high' : overdueRate > 5 ? 'medium' : 'low',
      });
      if (overdueRate > 10) status = 'critical';
      else if (overdueRate > 5) status = 'warning';
    }
    if (pendingReview > totalTasks * 0.2) {
      riskIndicators.push({ label: 'High pending review ratio', severity: 'medium' });
      if (status === 'healthy') status = 'warning';
    }
  }

  return { status, keyMetrics, riskIndicators };
}
