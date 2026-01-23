import { supabase } from '@/lib/supabase/client';

export interface UserTaskCounts {
  total_assigned: number;
  total_completed: number;
  total_pending: number;
  total_in_progress: number;
  total_pending_review: number;
  total_archived: number;
  completion_rate: number;
}

export interface UserPerformanceSummary {
  task_counts: UserTaskCounts;
  avg_completion_time_seconds: number;
  timeliness: {
    on_time_count: number;
    overdue_count: number;
    timeliness_rate: number;
  };
  review_metrics: {
    reviewed_count: number;
    approved_count: number;
    approval_rate: number;
  };
  weekly_stats: {
    this_week_completed: number;
    last_week_completed: number;
    week_over_week_change: number;
  };
}

export interface WeeklyTrend {
  week_start: string;
  week_end: string;
  week_label: string;
  completed_count: number;
}

export interface ProductivityScoreBreakdown {
  completion_rate: {
    value: number;
    weight: number;
    contribution: number;
  };
  timeliness: {
    value: number;
    weight: number;
    contribution: number;
  };
  consistency: {
    value: number;
    weight: number;
    contribution: number;
  };
  review_approval: {
    value: number;
    weight: number;
    contribution: number;
  };
}

export interface ProductivityScore {
  productivity_score: number;
  breakdown: ProductivityScoreBreakdown;
}

export interface UserPerformanceRanking {
  user_id: string;
  user_email: string;
  user_full_name: string | null;
  productivity_score: number;
  total_assigned: number;
  total_completed: number;
  completion_rate: number;
}

/**
 * Get task counts for a user
 */
export async function getUserTaskCounts(
  userId: string
): Promise<{ data: UserTaskCounts | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('get_user_task_counts', {
      p_user_id: userId,
    } as any);

    if (error) {
      return { data: null, error: error as Error };
    }

    if (!data) {
      return {
        data: {
          total_assigned: 0,
          total_completed: 0,
          total_pending: 0,
          total_in_progress: 0,
          total_pending_review: 0,
          total_archived: 0,
          completion_rate: 0,
        },
        error: null,
      };
    }

    // RPC returns a single row object, not an array
    const result = (Array.isArray(data) ? data[0] : data) as UserTaskCounts;
    return { data: result, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get comprehensive performance summary for a user
 */
export async function getUserPerformanceSummary(
  userId: string
): Promise<{ data: UserPerformanceSummary | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('get_user_performance_summary', {
      p_user_id: userId,
    } as any);

    if (error) {
      return { data: null, error: error as Error };
    }

    if (!data) {
      return { data: null, error: new Error('No data returned') };
    }

    return { data: data as UserPerformanceSummary, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get weekly trend data for a user
 */
export async function getUserWeeklyTrends(
  userId: string,
  weeks: number = 8
): Promise<{ data: WeeklyTrend[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('get_user_weekly_trends', {
      p_user_id: userId,
      p_weeks: weeks,
    } as any);

    if (error) {
      return { data: null, error: error as Error };
    }

    if (!data) {
      return { data: [], error: null };
    }

    // Convert JSONB array to array
    const trends = Array.isArray(data) ? data : [];
    return { data: trends as WeeklyTrend[], error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Calculate productivity score for a user
 */
export async function calculateProductivityScore(
  userId: string
): Promise<{ data: ProductivityScore | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('calculate_productivity_score', {
      p_user_id: userId,
    } as any);

    if (error) {
      return { data: null, error: error as Error };
    }

    if (!data) {
      return { data: null, error: new Error('No data returned') };
    }

    return { data: data as ProductivityScore, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get performance rankings for all users (admin/super admin only)
 */
export async function getAllUsersPerformance(): Promise<{
  data: UserPerformanceRanking[] | null;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase.rpc('get_all_users_performance');

    if (error) {
      return { data: null, error: error as Error };
    }

    if (!data) {
      return { data: [], error: null };
    }

    return { data: data as UserPerformanceRanking[], error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

/**
 * Get percentile rank for a user's productivity score
 */
export function calculatePercentileRank(
  userScore: number,
  allScores: number[]
): number {
  if (allScores.length === 0) return 0;
  if (allScores.length === 1) return 100;

  const sortedScores = [...allScores].sort((a, b) => b - a); // Descending
  const rank = sortedScores.findIndex((score) => score <= userScore);
  
  if (rank === -1) return 0; // Lowest score
  
  // Calculate percentile: (number of scores above or equal) / total * 100
  const percentile = ((sortedScores.length - rank) / sortedScores.length) * 100;
  return Math.round(percentile);
}
