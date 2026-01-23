import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePage } from '@/contexts/PageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase/client';
import {
  getUserPerformanceSummary,
  getUserWeeklyTrends,
  calculateProductivityScore,
  getAllUsersPerformance,
  calculatePercentileRank,
  type UserPerformanceSummary,
  type WeeklyTrend,
  type ProductivityScore,
  type UserPerformanceRanking,
} from '@/lib/services/userPerformanceService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/skeletons';
import { ArrowLeft, TrendingUp, TrendingDown, Clock, CheckCircle2, XCircle, AlertCircle, BarChart3 } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend,
  Filler
);

export function UserPerformanceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { permissions, appUser } = useAuth();
  const { setBackButton } = usePage();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [performanceSummary, setPerformanceSummary] = useState<UserPerformanceSummary | null>(null);
  const [weeklyTrends, setWeeklyTrends] = useState<WeeklyTrend[]>([]);
  const [productivityScore, setProductivityScore] = useState<ProductivityScore | null>(null);
  const [allUsersPerformance, setAllUsersPerformance] = useState<UserPerformanceRanking[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [percentile, setPercentile] = useState<number | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

  // Watch for DOM changes to dark class to avoid race conditions
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    
    return () => observer.disconnect();
  }, []);

  // Prepare chart data for Chart.js
  const chartData = useMemo(() => {
    if (weeklyTrends.length === 0) {
      return null;
    }

    return {
      labels: weeklyTrends.map(trend => trend.week_label),
      datasets: [
        {
          label: 'Tasks Completed',
          data: weeklyTrends.map(trend => trend.completed_count),
          borderColor: 'hsl(var(--primary))',
          backgroundColor: 'hsl(var(--primary) / 0.1)',
          fill: false,
          tension: 0.4,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: 'hsl(var(--primary))',
          pointBorderColor: 'hsl(var(--card))',
          pointBorderWidth: 2,
        },
      ],
    };
  }, [weeklyTrends]);

  // Chart.js options with dark mode support
  const chartOptions = useMemo(() => {
    // Use an existing element in the DOM to get computed colors (ensures proper theme inheritance)
    // We'll use the document body or create a hidden element attached to root
    const tempEl = document.createElement('div');
    tempEl.style.position = 'absolute';
    tempEl.style.visibility = 'hidden';
    tempEl.style.pointerEvents = 'none';
    tempEl.style.top = '0';
    tempEl.style.left = '0';
    // Attach to documentElement to ensure it inherits the dark class
    document.documentElement.appendChild(tempEl);
    
    // Set CSS variable-based colors and get computed RGB values
    tempEl.style.color = 'var(--foreground)';
    const textColor = getComputedStyle(tempEl).color;
    
    tempEl.style.borderColor = 'var(--border)';
    const gridColor = getComputedStyle(tempEl).borderColor;
    
    tempEl.style.backgroundColor = 'var(--card)';
    const cardBg = getComputedStyle(tempEl).backgroundColor;
    
    document.documentElement.removeChild(tempEl);

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom' as const,
          labels: {
            color: textColor,
            font: {
              size: 12,
            },
            usePointStyle: true,
            pointStyle: 'line',
          },
        },
        tooltip: {
          backgroundColor: cardBg,
          titleColor: textColor,
          bodyColor: textColor,
          borderColor: gridColor,
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: (context: any) => {
              return `${context.parsed.y} tasks completed`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: textColor,
            font: {
              size: 10,
            },
            maxRotation: 45,
            minRotation: 45,
          },
          grid: {
            color: gridColor,
            opacity: 0.3,
          },
        },
        y: {
          ticks: {
            color: textColor,
            font: {
              size: 12,
            },
            stepSize: 1,
            precision: 0,
          },
          grid: {
            color: gridColor,
            opacity: 0.3,
          },
          beginAtZero: true,
        },
      },
    };
    
    return options;
  }, [theme, isDarkMode]);

  // Check permissions - users can only view their own performance
  const canView = useCallback(() => {
    if (!id || !appUser) return false;
    if (permissions.canViewAllUsers) return true; // Admin/Super Admin can view anyone
    return id === appUser.id; // Regular users can only view their own
  }, [id, appUser, permissions.canViewAllUsers]);

  const fetchPerformanceData = useCallback(async () => {
    if (!id || !canView()) {
      setError('You do not have permission to view this performance data.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch user name first
      if (id) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('full_name, email')
          .eq('id', id)
          .single();
        if (userError) {
          console.error('Error fetching user name:', userError);
          setUserName(null);
        } else if (userData) {
          const user = userData as { full_name?: string | null; email?: string };
          setUserName(user.full_name ?? user.email ?? 'User');
        }
      }

      // Fetch all data in parallel
      const [summaryResult, trendsResult, scoreResult, allUsersResult] = await Promise.all([
        getUserPerformanceSummary(id),
        getUserWeeklyTrends(id, 8),
        calculateProductivityScore(id),
        permissions.canViewAllUsers ? getAllUsersPerformance().catch((err) => {
          // Silently handle errors for getAllUsersPerformance - it's optional data
          console.warn('Could not fetch all users performance data:', err);
          return { data: null, error: null };
        }) : Promise.resolve({ data: null, error: null }),
      ]);

      if (summaryResult.error) {
        setError(summaryResult.error.message);
        return;
      }
      if (trendsResult.error) {
        setError(trendsResult.error.message);
        return;
      }
      if (scoreResult.error) {
        setError(scoreResult.error.message);
        return;
      }

      setPerformanceSummary(summaryResult.data);
      setWeeklyTrends(trendsResult.data ?? []);
      setProductivityScore(scoreResult.data);

      // Calculate ranking and percentile if admin (silently fail if data unavailable)
      if (allUsersResult && !allUsersResult.error && allUsersResult.data && allUsersResult.data.length > 0) {
        setAllUsersPerformance(allUsersResult.data);
        const userIndex = allUsersResult.data.findIndex((u) => u.user_id === id);
        if (userIndex !== -1) {
          setUserRank(userIndex + 1);
          const allScores = allUsersResult.data.map((u) => u.productivity_score);
          const userScore = scoreResult.data?.productivity_score ?? 0;
          setPercentile(calculatePercentileRank(userScore, allScores));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load performance data');
    } finally {
      setLoading(false);
    }
  }, [id, canView, permissions.canViewAllUsers]);

  useEffect(() => {
    fetchPerformanceData();
  }, [fetchPerformanceData]);

  // Subscribe to real-time task updates
  useEffect(() => {
    if (!id || !canView()) return;

    // Subscribe to task changes that affect this user's performance
    const taskChannel = supabase
      .channel(`user-performance-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `assigned_to=eq.${id}`,
        },
        () => {
          // Debounce refresh to avoid excessive calls
          setTimeout(() => {
            fetchPerformanceData();
          }, 1000);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_assignees',
          filter: `user_id=eq.${id}`,
        },
        () => {
          setTimeout(() => {
            fetchPerformanceData();
          }, 1000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(taskChannel);
    };
  }, [id, canView, fetchPerformanceData]);

  // Set back button in top nav
  useEffect(() => {
    setBackButton(
      <Button 
        variant="ghost" 
        size="icon"
        onClick={() => navigate('/users')}
        className="h-10 w-10"
      >
        <ArrowLeft className="h-10 w-10" />
      </Button>
    );
    return () => {
      setBackButton(null);
    };
  }, [navigate, setBackButton]);

  if (!canView()) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">You don't have permission to view this performance data.</p>
        <Button onClick={() => navigate('/users')} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Users
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton height={40} width="30%" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={150} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !performanceSummary || !productivityScore) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive mb-4">{error ?? 'Failed to load performance data'}</p>
        <Button onClick={() => navigate('/users')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Users
        </Button>
      </div>
    );
  }

  const taskCounts = performanceSummary.task_counts;
  const timeliness = performanceSummary.timeliness;
  const weeklyStats = performanceSummary.weekly_stats;
  const reviewMetrics = performanceSummary.review_metrics;

  // Format average completion time
  const avgCompletionDays = Math.round(performanceSummary.avg_completion_time_seconds / 86400);
  const avgCompletionHours = Math.round((performanceSummary.avg_completion_time_seconds % 86400) / 3600);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold">{userName ?? 'User Performance Dashboard'}</h1>
          <p className="text-muted-foreground mt-1">
            {appUser?.id === id ? 'Your Performance Metrics' : 'Performance Analytics'}
          </p>
        </div>
      </div>

      {/* Productivity Score Card */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Productivity Score
          </CardTitle>
          <CardDescription>
            Weighted score based on completion rate, timeliness, consistency, and review approval
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-4xl font-bold mb-2">{productivityScore.productivity_score.toFixed(1)}</div>
              <div className="text-sm text-muted-foreground">Out of 100</div>
              {userRank !== null && percentile !== null && (
                <div className="mt-2 text-sm">
                  <span className="text-muted-foreground">Rank: </span>
                  <span className="font-semibold">#{userRank}</span>
                  <span className="text-muted-foreground ml-4">Percentile: </span>
                  <span className="font-semibold">Top {100 - percentile}%</span>
                </div>
              )}
            </div>
            <div className="w-32 h-32 relative">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  className="text-muted"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${(productivityScore.productivity_score / 100) * 352} 352`}
                  className="text-primary"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold">{productivityScore.productivity_score.toFixed(0)}</span>
              </div>
            </div>
          </div>

          {/* Score Breakdown */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Completion Rate</div>
              <div className="text-lg font-semibold">
                {productivityScore.breakdown.completion_rate.value.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">
                Weight: {productivityScore.breakdown.completion_rate.weight}%
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Timeliness</div>
              <div className="text-lg font-semibold">
                {productivityScore.breakdown.timeliness.value.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">
                Weight: {productivityScore.breakdown.timeliness.weight}%
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Consistency</div>
              <div className="text-lg font-semibold">
                {productivityScore.breakdown.consistency.value.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">
                Weight: {productivityScore.breakdown.consistency.weight}%
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Review Approval</div>
              <div className="text-lg font-semibold">
                {productivityScore.breakdown.review_approval.value.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">
                Weight: {productivityScore.breakdown.review_approval.weight}%
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task Performance Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Total Tasks Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{taskCounts.total_assigned}</div>
            <div className="text-sm text-muted-foreground mt-1">Lifetime</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tasks Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {taskCounts.total_completed}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {taskCounts.completion_rate.toFixed(1)}% completion rate
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tasks Pending / In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
              {taskCounts.total_pending + taskCounts.total_in_progress}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {taskCounts.total_pending} pending, {taskCounts.total_in_progress} in progress
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tasks Pending Review</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {taskCounts.total_pending_review}
            </div>
            <Link
              to={`/tasks?assignedTo=${id}&task_status=Done`}
              className="text-sm text-primary hover:underline mt-1 block"
            >
              View pending reviews →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Archived / Closed Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-600 dark:text-gray-400">
              {taskCounts.total_archived}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Completed and archived</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Average Completion Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {avgCompletionDays > 0 ? `${avgCompletionDays}d` : ''}
              {avgCompletionHours > 0 ? ` ${avgCompletionHours}h` : avgCompletionDays === 0 ? '< 1h' : ''}
            </div>
            <div className="text-sm text-muted-foreground mt-1">Per completed task</div>
          </CardContent>
        </Card>
      </div>

      {/* Timeliness Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Timeliness Metrics
          </CardTitle>
          <CardDescription>On-time vs overdue task completion</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium">On Time</span>
              </div>
              <div className="text-2xl font-bold">{timeliness.on_time_count}</div>
              <div className="text-xs text-muted-foreground">
                {timeliness.timeliness_rate.toFixed(1)}% of tasks with due dates
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium">Overdue</span>
              </div>
              <div className="text-2xl font-bold">{timeliness.overdue_count}</div>
              <div className="text-xs text-muted-foreground">
                Active tasks past due date
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Timeliness Rate</div>
              <div className="text-2xl font-bold">{timeliness.timeliness_rate.toFixed(1)}%</div>
              <div className="w-full bg-muted rounded-full h-2 mt-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${timeliness.timeliness_rate}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weekly Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Weekly Performance
          </CardTitle>
          <CardDescription>Tasks completed this week vs last week</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">This Week</div>
              <div className="text-3xl font-bold">{weeklyStats.this_week_completed}</div>
              <div className="text-xs text-muted-foreground">Tasks completed</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Last Week</div>
              <div className="text-3xl font-bold">{weeklyStats.last_week_completed}</div>
              <div className="text-xs text-muted-foreground">Tasks completed</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Week-over-Week Change</div>
              <div className={`text-3xl font-bold flex items-center gap-2 ${
                weeklyStats.week_over_week_change >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}>
                {weeklyStats.week_over_week_change >= 0 ? (
                  <TrendingUp className="h-6 w-6" />
                ) : (
                  <TrendingDown className="h-6 w-6" />
                )}
                {Math.abs(weeklyStats.week_over_week_change).toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">
                {weeklyStats.week_over_week_change >= 0 ? 'Increase' : 'Decrease'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weekly Trend Chart */}
      {weeklyTrends.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>8-Week Completion Trend</CardTitle>
            <CardDescription>Tasks completed per week</CardDescription>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 w-full">
            <div className="w-full h-[300px]">
              {chartData ? (
                <Line data={chartData} options={chartOptions} key={`chart-${theme}`} />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review Metrics */}
      {reviewMetrics.reviewed_count > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Review Metrics
            </CardTitle>
            <CardDescription>Task review approval statistics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">Reviewed Tasks</div>
                <div className="text-2xl font-bold">{reviewMetrics.reviewed_count}</div>
                <div className="text-xs text-muted-foreground">Total tasks reviewed</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Approved</div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {reviewMetrics.approved_count}
                </div>
                <div className="text-xs text-muted-foreground">Tasks approved</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Approval Rate</div>
                <div className="text-2xl font-bold">{reviewMetrics.approval_rate.toFixed(1)}%</div>
                <div className="w-full bg-muted rounded-full h-2 mt-2">
                  <div
                    className="bg-green-600 dark:bg-green-400 h-2 rounded-full transition-all"
                    style={{ width: `${reviewMetrics.approval_rate}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comparative Analytics (Admin/Super Admin only) */}
      {permissions.canViewAllUsers && allUsersPerformance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Team Rankings</CardTitle>
            <CardDescription>Productivity score comparison across all users</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {allUsersPerformance.slice(0, 10).map((user, index) => (
                <div
                  key={user.user_id}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    user.user_id === id
                      ? 'bg-primary/10 border-2 border-primary'
                      : 'bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-lg font-bold w-8">#{index + 1}</div>
                    <div>
                      <div className="font-medium">{user.user_full_name ?? user.user_email}</div>
                      <div className="text-xs text-muted-foreground">{user.user_email}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{user.productivity_score.toFixed(1)}</div>
                    <div className="text-xs text-muted-foreground">
                      {user.total_completed}/{user.total_assigned} tasks
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
