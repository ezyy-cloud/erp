// Supabase Edge Function: Generate PDF Report
// Generates server-side PDF reports for Super Admin users only
// Supports: user_performance, task_lifecycle, project, company_wide

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// pdf-lib will be imported dynamically when needed to avoid cold start issues

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

interface ReportParams {
  reportType: 'user_performance' | 'task_lifecycle' | 'project' | 'company_wide';
  userId?: string;
  projectId?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface ReportData {
  title: string;
  generatedBy: string;
  generatedAt: string;
  content: any;
}

serve(async (req) => {
  // Handle CORS preflight - must be first and return immediately
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 200,
      headers: corsHeaders 
    });
  }

  // Only allow POST for actual requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    const startTime = Date.now();
    
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Missing Supabase configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with Authorization header for JWT verification
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the JWT token - try getClaims first (for asymmetric signing keys), fallback to getUser
    let callerUserId: string | null = null;
    let callerUser: any = null;
    let callerUserError: any = null;
    
    try {
      // Try getClaims first (works with newer asymmetric signing keys)
      const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
      
      if (!claimsError && claims?.sub) {
        // Successfully got user ID from claims
        callerUserId = claims.sub;
      } else {
        // Fallback to getUser (for legacy symmetric JWT)
        const result = await supabase.auth.getUser(token);
        callerUser = result.data;
        callerUserError = result.error;
        
        if (callerUserError || !callerUser?.user) {
          return new Response(
            JSON.stringify({ 
              error: callerUserError?.message ?? claimsError?.message ?? 'Invalid JWT',
              details: 'Invalid or expired JWT token. Please refresh your session and try again.'
            }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        callerUserId = callerUser.user.id;
      }
    } catch (validationException) {
      return new Response(
        JSON.stringify({ 
          error: validationException instanceof Error ? validationException.message : 'Token validation failed',
          details: 'An exception occurred while validating the JWT token.'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!callerUserId) {
      return new Response(
        JSON.stringify({ 
          error: 'Could not extract user ID from token',
          details: 'Token validation succeeded but user ID could not be determined.'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get full user details using Admin API (since we have service role key)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: { user: currentUser }, error: adminUserError } = await adminClient.auth.admin.getUserById(callerUserId);

    if (adminUserError || !currentUser) {
      return new Response(
        JSON.stringify({ 
          error: adminUserError?.message ?? 'User not found',
          details: 'Could not retrieve user information from token.'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify Super Admin role
    // Fetch user and role separately to avoid RLS issues with joins
    const { data: callerUserData, error: callerRoleError } = await adminClient
      .from('users')
      .select('role_id, full_name, email')
      .eq('id', currentUser.id)
      .single();

    if (callerRoleError || !callerUserData || !callerUserData.role_id) {
      return new Response(
        JSON.stringify({ error: 'User not found or has no role' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: callerRoleData, error: roleFetchError } = await supabase
      .from('roles')
      .select('name')
      .eq('id', callerUserData.role_id)
      .single();

    if (roleFetchError || !callerRoleData || callerRoleData.name !== 'super_admin') {
      return new Response(
        JSON.stringify({ error: 'Unauthorized. Super Admin access required.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    let params: ReportParams;
    try {
      params = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!params.reportType) {
      return new Response(
        JSON.stringify({ error: 'Missing reportType parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch report data based on type
    let reportData: ReportData;
    try {
      reportData = await fetchReportData(adminClient, params, callerUserData.full_name ?? callerUserData.email);
    } catch (error) {
      const duration = Date.now() - startTime;
      await logReportGeneration(
        adminClient,
        callerUserId,
        params.reportType,
        params,
        null,
        duration,
        'failed',
        error.message
      );
      return new Response(
        JSON.stringify({ error: `Failed to fetch report data: ${error.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log successful data fetch (PDF generation happens client-side)
    const duration = Date.now() - startTime;
    await logReportGeneration(
      adminClient,
      callerUserId,
      params.reportType,
      params,
      null, // PDF size not known at this point (generated client-side)
      duration,
      'success',
      null
    );

    // Return report data as JSON (client will generate PDF)
    return new Response(JSON.stringify(reportData), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Edge Function error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An unexpected error occurred' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function fetchReportData(
  adminClient: any,
  params: ReportParams,
  generatedByName: string
): Promise<ReportData> {
  const generatedAt = new Date().toLocaleString('en-US', {
    timeZone: 'UTC',
    dateStyle: 'long',
    timeStyle: 'short',
  });

  switch (params.reportType) {
    case 'user_performance':
      if (!params.userId) throw new Error('userId required for user_performance report');
      return await fetchUserPerformanceData(adminClient, params, generatedByName, generatedAt);
    
    case 'task_lifecycle':
      return await fetchTaskLifecycleData(adminClient, params, generatedByName, generatedAt);
    
    case 'project':
      if (!params.projectId) throw new Error('projectId required for project report');
      return await fetchProjectData(adminClient, params, generatedByName, generatedAt);
    
    case 'company_wide':
      return await fetchCompanyWideData(adminClient, params, generatedByName, generatedAt);
    
    default:
      throw new Error(`Unknown report type: ${params.reportType}`);
  }
}

async function fetchUserPerformanceData(
  adminClient: any,
  params: ReportParams,
  generatedByName: string,
  generatedAt: string
): Promise<ReportData> {
  const { data: user, error: userError } = await adminClient
    .from('users')
    .select('id, full_name, email, created_at')
    .eq('id', params.userId)
    .single();

  if (userError || !user) throw new Error('User not found');

  // Build date filter
  let dateFilter = '';
  if (params.dateFrom || params.dateTo) {
    dateFilter = 'AND t.created_at';
    if (params.dateFrom) dateFilter += ` >= '${params.dateFrom}'`;
    if (params.dateTo) dateFilter += ` <= '${params.dateTo}'`;
  }

  // Get task counts
  const { data: taskCounts } = await adminClient.rpc('get_user_task_counts', {
    p_user_id: params.userId,
  });

  // Get task IDs from task_assignees table
  const { data: assignedTaskIds } = await adminClient
    .from('task_assignees')
    .select('task_id')
    .eq('user_id', params.userId);

  const assignedIds = (assignedTaskIds ?? []).map((a: any) => a.task_id);

  // Build query for tasks assigned via task_assignees or legacy assigned_to
  // We'll fetch both sets and combine them
  const tasksFromAssignees: any[] = [];
  const tasksFromLegacy: any[] = [];

  // Fetch tasks via task_assignees
  if (assignedIds.length > 0) {
    let query1 = adminClient
      .from('tasks')
      .select('id, title, task_status, due_date, created_at, priority')
      .is('deleted_at', null)
      .is('archived_at', null) // Exclude archived tasks (same as UI)
      .in('id', assignedIds);

    if (params.dateFrom) {
      query1 = query1.gte('created_at', params.dateFrom);
    }
    if (params.dateTo) {
      query1 = query1.lte('created_at', params.dateTo);
    }
    if (params.projectId) {
      query1 = query1.eq('project_id', params.projectId);
    }

    const { data: data1, error: error1 } = await query1;
    if (error1) {
      console.error('Error fetching tasks from assignees:', error1);
    }
    if (data1) tasksFromAssignees.push(...data1);
  }

  // Fetch tasks via legacy assigned_to
  let query2 = adminClient
    .from('tasks')
    .select('id, title, task_status, due_date, created_at, priority')
    .is('deleted_at', null)
    .is('archived_at', null) // Exclude archived tasks (same as UI)
    .eq('assigned_to', params.userId);

  if (params.dateFrom) {
    query2 = query2.gte('created_at', params.dateFrom);
  }
  if (params.dateTo) {
    query2 = query2.lte('created_at', params.dateTo);
  }
  if (params.projectId) {
    query2 = query2.eq('project_id', params.projectId);
  }

  const { data: data2, error: error2 } = await query2;
  if (error2) {
    console.error('Error fetching tasks from legacy assigned_to:', error2);
  }
  if (data2) tasksFromLegacy.push(...data2);

  // Combine and deduplicate by task ID
  const taskMap = new Map();
  [...tasksFromAssignees, ...tasksFromLegacy].forEach((task: any) => {
    if (!taskMap.has(task.id)) {
      taskMap.set(task.id, task);
    }
  });

  const tasks = Array.from(taskMap.values());

  // Calculate productivity metrics
  const totalTasks = taskCounts?.[0]?.total_assigned ?? 0;
  const completedTasks = taskCounts?.[0]?.total_completed ?? 0;
  const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  // Get overdue tasks
  const now = new Date().toISOString();
  const overdueTasks = tasks.filter(
    (t: any) => t.due_date && t.due_date < now && t.task_status !== 'Closed'
  );

  return {
    title: `User Performance Report - ${user.full_name ?? user.email}`,
    generatedBy: generatedByName,
    generatedAt,
    content: {
      user,
      taskCounts: taskCounts?.[0] ?? {},
      tasks: tasks,
      overdueTasks: overdueTasks.length,
      completionRate: completionRate.toFixed(1),
      dateRange: { from: params.dateFrom, to: params.dateTo },
      projectFilter: params.projectId,
    },
  };
}

async function fetchTaskLifecycleData(
  adminClient: any,
  params: ReportParams,
  generatedByName: string,
  generatedAt: string
): Promise<ReportData> {
  // Build query - exclude archived tasks (same as UI)
  let query = adminClient
    .from('tasks')
    .select('id, title, task_status, created_at, archived_at, updated_at, project_id')
    .is('deleted_at', null)
    .is('archived_at', null); // Exclude archived tasks (same as UI)

  if (params.dateFrom) {
    query = query.gte('created_at', params.dateFrom);
  }
  if (params.dateTo) {
    query = query.lte('created_at', params.dateTo);
  }
  if (params.projectId) {
    query = query.eq('project_id', params.projectId);
  }

  const { data: tasks, error: tasksError } = await query;
  
  // Log for debugging
  console.log('Task lifecycle report query:', {
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    projectId: params.projectId,
    tasksFound: tasks?.length ?? 0,
    error: tasksError?.message,
  });
  
  // Log error if query fails
  if (tasksError) {
    console.error('Error fetching task lifecycle tasks:', tasksError);
    throw new Error(`Failed to fetch tasks: ${tasksError.message}`);
  }
  
  // Fetch project names separately if needed
  const projectIds = [...new Set((tasks ?? []).map((t: any) => t.project_id).filter(Boolean))];
  const projectNamesMap = new Map<string, string>();
  
  if (projectIds.length > 0) {
    const { data: projectsData } = await adminClient
      .from('projects')
      .select('id, name')
      .in('id', projectIds);
    
    (projectsData ?? []).forEach((p: any) => {
      projectNamesMap.set(p.id, p.name);
    });
  }
  
  // Attach project names to tasks
  const tasksWithProjects = (tasks ?? []).map((task: any) => ({
    ...task,
    project_name: task.project_id ? projectNamesMap.get(task.project_id) : null,
  }));

  // Calculate lifecycle metrics
  const statusCounts = {
    ToDo: 0,
    'Work-In-Progress': 0,
    Done: 0,
    Closed: 0,
  };

  const stageTimes: Record<string, number[]> = {
    ToDo: [],
    'Work-In-Progress': [],
    Done: [],
  };

  let reopenedCount = 0;

  tasksWithProjects.forEach((task: any) => {
    // Count by status - ensure task_status exists and is valid
    if (task.task_status) {
      const status = task.task_status as keyof typeof statusCounts;
      if (statusCounts.hasOwnProperty(status)) {
        statusCounts[status]++;
      }
    }
    
    // Calculate time in stage (simplified)
    if (task.updated_at && task.created_at) {
      const timeDiff = new Date(task.updated_at).getTime() - new Date(task.created_at).getTime();
      const days = timeDiff / (1000 * 60 * 60 * 24);
      if (task.task_status && task.task_status !== 'Closed') {
        const status = task.task_status as keyof typeof stageTimes;
        if (stageTimes.hasOwnProperty(status)) {
          stageTimes[status]?.push(days);
        }
      }
    }

    // Check for reopened (archived_at exists but task_status is not Closed)
    // Note: Since we filter archived_at IS NULL, this should be 0, but keeping for completeness
    if (task.archived_at && task.task_status !== 'Closed') {
      reopenedCount++;
    }
  });

  const avgTimes = Object.entries(stageTimes).map(([stage, times]) => ({
    stage,
    avgDays: times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0,
  }));

  // Find bottlenecks (tasks in Done status for > 7 days)
  const now = new Date();
  const bottlenecks = tasksWithProjects.filter((t: any) => {
    if (t.task_status !== 'Done') return false;
    if (!t.updated_at) return false;
    const updated = new Date(t.updated_at);
    const daysSinceUpdate = (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate > 7;
  });

  return {
    title: 'Task Lifecycle Report',
    generatedBy: generatedByName,
    generatedAt,
    content: {
      totalTasks: tasksWithProjects?.length ?? 0,
      statusCounts,
      avgTimes,
      reopenedCount,
      bottlenecks: bottlenecks.length,
      dateRange: { from: params.dateFrom, to: params.dateTo },
      projectFilter: params.projectId,
    },
  };
}

async function fetchProjectData(
  adminClient: any,
  params: ReportParams,
  generatedByName: string,
  generatedAt: string
): Promise<ReportData> {
  const { data: project, error: projectError } = await adminClient
    .from('projects')
    .select('id, name, description, status, created_at, updated_at')
    .eq('id', params.projectId)
    .single();

  if (projectError || !project) throw new Error('Project not found');

  // Build query - match UI query pattern exactly
  // First, get basic task data (simpler query to avoid join issues)
  let taskQuery = adminClient
    .from('tasks')
    .select('id, title, task_status, created_at, due_date, priority')
    .eq('project_id', params.projectId)
    .is('deleted_at', null)
    .is('archived_at', null); // Exclude archived tasks (same as UI)

  // Apply date filters if provided (filter by created_at)
  if (params.dateFrom) {
    taskQuery = taskQuery.gte('created_at', params.dateFrom);
  }
  if (params.dateTo) {
    taskQuery = taskQuery.lte('created_at', params.dateTo);
  }

  const { data: tasks, error: tasksError } = await taskQuery;
  
  // Log for debugging
  console.log('Project report query:', {
    projectId: params.projectId,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    tasksFound: tasks?.length ?? 0,
    error: tasksError?.message,
  });
  
  // Log error if query fails
  if (tasksError) {
    console.error('Error fetching project tasks:', tasksError);
    throw new Error(`Failed to fetch tasks: ${tasksError.message}`);
  }
  
  // Now fetch assignees separately for tasks that have them
  const taskIds = (tasks ?? []).map((t: any) => t.id);
  let assigneesMap: Record<string, any[]> = {};
  
  if (taskIds.length > 0) {
    const { data: assigneesData } = await adminClient
      .from('task_assignees')
      .select('task_id, user_id, users(full_name, email)')
      .in('task_id', taskIds);
    
    // Group assignees by task_id
    (assigneesData ?? []).forEach((assignee: any) => {
      if (!assigneesMap[assignee.task_id]) {
        assigneesMap[assignee.task_id] = [];
      }
      assigneesMap[assignee.task_id].push(assignee);
    });
  }
  
  // Attach assignees to tasks
  const tasksWithAssignees = (tasks ?? []).map((task: any) => ({
    ...task,
    task_assignees: assigneesMap[task.id] ?? [],
  }));
  
  // If no tasks found, return empty report
  if (!tasksWithAssignees || tasksWithAssignees.length === 0) {
    return {
      title: `Project Report - ${project.name}`,
      generatedBy: generatedByName,
      generatedAt,
      content: {
        project,
        totalTasks: 0,
        statusCounts: { ToDo: 0, 'Work-In-Progress': 0, Done: 0, Closed: 0 },
        completed: 0,
        pending: 0,
        userContributions: {},
        dateRange: { from: params.dateFrom, to: params.dateTo },
      },
    };
  }

  const statusCounts = {
    ToDo: 0,
    'Work-In-Progress': 0,
    Done: 0,
    Closed: 0,
  };

  const userContributions: Record<string, number> = {};

  tasksWithAssignees.forEach((task: any) => {
    // Count by status - ensure task_status exists
    if (task.task_status) {
      const status = task.task_status as keyof typeof statusCounts;
      if (statusCounts.hasOwnProperty(status)) {
        statusCounts[status]++;
      }
    }
    
    // Count user contributions
    if (task.task_assignees && Array.isArray(task.task_assignees) && task.task_assignees.length > 0) {
      task.task_assignees.forEach((assignee: any) => {
        if (assignee.users) {
          const userName = assignee.users.full_name ?? assignee.users.email ?? 'Unknown';
          userContributions[userName] = (userContributions[userName] ?? 0) + 1;
        }
      });
    } else {
      // Count unassigned tasks
      userContributions['Unassigned'] = (userContributions['Unassigned'] ?? 0) + 1;
    }
  });

  const completed = statusCounts.Closed;
  const pending = statusCounts.ToDo + statusCounts['Work-In-Progress'] + statusCounts.Done;

  return {
    title: `Project Report - ${project.name}`,
    generatedBy: generatedByName,
    generatedAt,
      content: {
        project,
        totalTasks: tasksWithAssignees?.length ?? 0,
      statusCounts,
      completed,
      pending,
      userContributions,
      dateRange: { from: params.dateFrom, to: params.dateTo },
    },
  };
}

async function fetchCompanyWideData(
  adminClient: any,
  params: ReportParams,
  generatedByName: string,
  generatedAt: string
): Promise<ReportData> {
  // Get total users
  const { count: userCount } = await adminClient
    .from('users')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null);

  // Get total projects
  const { count: projectCount } = await adminClient
    .from('projects')
    .select('*', { count: 'exact', head: true });

  // Get task distribution with date filters
  // First, get basic task data (simpler query to avoid join issues)
  let taskQuery = adminClient
    .from('tasks')
    .select('id, task_status, created_at, due_date, project_id')
    .is('deleted_at', null)
    .is('archived_at', null); // Exclude archived tasks (same as UI)

  // Apply date filters if provided (filter by created_at)
  if (params.dateFrom) {
    taskQuery = taskQuery.gte('created_at', params.dateFrom);
  }
  if (params.dateTo) {
    taskQuery = taskQuery.lte('created_at', params.dateTo);
  }

  const { data: tasks, error: tasksError } = await taskQuery;
  
  // Log for debugging
  console.log('Company-wide report query:', {
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    tasksFound: tasks?.length ?? 0,
    error: tasksError?.message,
  });
  
  // Log error if query fails
  if (tasksError) {
    console.error('Error fetching company-wide tasks:', tasksError);
    throw new Error(`Failed to fetch tasks: ${tasksError.message}`);
  }
  
  // Now fetch assignees separately for tasks that have them
  const taskIds = (tasks ?? []).map((t: any) => t.id);
  let assigneesMap: Record<string, any[]> = {};
  
  if (taskIds.length > 0) {
    const { data: assigneesData } = await adminClient
      .from('task_assignees')
      .select('task_id, user_id, users(full_name, email)')
      .in('task_id', taskIds);
    
    // Group assignees by task_id
    (assigneesData ?? []).forEach((assignee: any) => {
      if (!assigneesMap[assignee.task_id]) {
        assigneesMap[assignee.task_id] = [];
      }
      assigneesMap[assignee.task_id].push(assignee);
    });
  }
  
  // Attach assignees to tasks
  const tasksWithAssignees = (tasks ?? []).map((task: any) => ({
    ...task,
    task_assignees: assigneesMap[task.id] ?? [],
  }));

  const statusCounts = {
    ToDo: 0,
    'Work-In-Progress': 0,
    Done: 0,
    Closed: 0,
  };

  const userActivity: Record<string, number> = {};
  const projectTaskCounts: Record<string, number> = {};

  tasksWithAssignees.forEach((task: any) => {
    // Count by status - ensure task_status exists
    if (task.task_status) {
      const status = task.task_status as keyof typeof statusCounts;
      if (statusCounts.hasOwnProperty(status)) {
        statusCounts[status]++;
      }
    }
    
    // Count user activity (tasks assigned to users)
    if (task.task_assignees && Array.isArray(task.task_assignees) && task.task_assignees.length > 0) {
      task.task_assignees.forEach((assignee: any) => {
        if (assignee.users) {
          const userName = assignee.users.full_name ?? assignee.users.email ?? 'Unknown';
          userActivity[userName] = (userActivity[userName] ?? 0) + 1;
        }
      });
    }
    
    // Count tasks per project
    if (task.project_id) {
      projectTaskCounts[task.project_id] = (projectTaskCounts[task.project_id] ?? 0) + 1;
    }
  });

  // Get most active users
  const mostActiveUsers = Object.entries(userActivity)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, count]) => ({ name, taskCount: count }));

  // Get overdue and pending review counts
  const now = new Date().toISOString();
  const overdueCount = tasksWithAssignees.filter(
    (t: any) => t.due_date && new Date(t.due_date) < new Date(now) && t.task_status !== 'Closed'
  ).length;
  const pendingReviewCount = statusCounts.Done;
  
  // Get projects with highest task volume
  const projectsWithTasks = Object.entries(projectTaskCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  
  // Fetch project names for top projects
  const topProjectIds = projectsWithTasks.map(([id]) => id);
  const { data: topProjects } = topProjectIds.length > 0 
    ? await adminClient
        .from('projects')
        .select('id, name')
        .in('id', topProjectIds)
    : { data: [] };
  
  const projectNamesMap = new Map((topProjects ?? []).map((p: any) => [p.id, p.name]));
  const topProjectsList = projectsWithTasks.map(([id, count]) => ({
    name: projectNamesMap.get(id) ?? `Project ${id.substring(0, 8)}`,
    taskCount: count,
  }));

  return {
    title: 'Company-Wide Executive Report',
    generatedBy: generatedByName,
    generatedAt,
    content: {
      totalUsers: userCount ?? 0,
      totalProjects: projectCount ?? 0,
      totalTasks: tasksWithAssignees?.length ?? 0,
      statusCounts,
      mostActiveUsers,
      topProjects: topProjectsList,
      overdueCount,
      pendingReviewCount,
      dateRange: { from: params.dateFrom, to: params.dateTo },
    },
  };
}

// PDF generation is now handled client-side - this function removed

async function logReportGeneration(
  adminClient: any,
  generatedBy: string,
  reportType: string,
  params: ReportParams,
  fileSizeBytes: number | null,
  durationMs: number,
  status: string,
  errorMessage: string | null
) {
  try {
    await adminClient.rpc('log_report_generation', {
      p_generated_by: generatedBy,
      p_report_type: reportType,
      p_report_params: params,
      p_file_size_bytes: fileSizeBytes,
      p_generation_duration_ms: durationMs,
      p_status: status,
      p_error_message: errorMessage,
    });
  } catch (error) {
    console.error('Failed to log report generation:', error);
    // Don't fail the request if logging fails
  }
}
