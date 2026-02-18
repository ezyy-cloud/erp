// Supabase Edge Function: Purge Soft-Deleted Tasks
// - Runs with service role to hard-delete tasks soft-deleted more than N days ago.
// - Also deletes associated files from the `task-files` storage bucket.
// - Intended to be invoked from a scheduled job (cron), not directly by clients.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Only allow POST for actual execution
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Missing Supabase configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Read optional body: { retentionDays?: number, limit?: number }
    let retentionDays = 30;
    let limit = 500;

    try {
      const body = await req.json();
      if (typeof body?.retentionDays === 'number' && body.retentionDays > 0) {
        retentionDays = body.retentionDays;
      }
      if (typeof body?.limit === 'number' && body.limit > 0 && body.limit <= 2000) {
        limit = body.limit;
      }
    } catch {
      // No/invalid JSON - fall back to defaults
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    // 1) Find soft-deleted tasks older than cutoff
    const { data: tasksToPurge, error: selectError } = await adminClient
      .from('tasks')
      .select('id')
      .not('deleted_at', 'is', null)
      .lt('deleted_at', cutoff.toISOString())
      .order('deleted_at', { ascending: true })
      .limit(limit);

    if (selectError) {
      console.error('Error selecting tasks to purge:', selectError);
      return new Response(
        JSON.stringify({ error: 'Failed to select tasks to purge', details: selectError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const taskIds = (tasksToPurge ?? []).map((t: { id: string }) => t.id);

    if (taskIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, purgedTasks: 0, message: 'No soft-deleted tasks to purge' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2) Fetch associated file paths before deleting tasks
    const { data: taskFiles, error: filesError } = await adminClient
      .from('task_files')
      .select('file_path')
      .in('task_id', taskIds);

    if (filesError) {
      console.error('Error fetching task files for purge:', filesError);
    }

    // Normalize file paths for the `task-files` bucket
    const pathsToDelete = Array.from(
      new Set(
        (taskFiles ?? [])
          .map((f: { file_path: string }) => f.file_path)
          .filter((p) => !!p)
          .map((p) => (p.startsWith('task-files/') ? p.slice('task-files/'.length) : p)),
      ),
    );

    let storageResult: { error?: string; deletedCount?: number } | null = null;

    if (pathsToDelete.length > 0) {
      const { error: storageError } = await adminClient
        .storage
        .from('task-files')
        .remove(pathsToDelete);

      if (storageError) {
        console.error('Error deleting files from storage:', storageError);
        storageResult = { error: storageError.message };
      } else {
        storageResult = { deletedCount: pathsToDelete.length };
      }
    }

    // 3) Hard-delete tasks (cascades to task_files, comments, notes, etc. via FK constraints)
    const { error: deleteError, count } = await adminClient
      .from('tasks')
      .delete({ count: 'exact', returning: 'minimal' })
      .in('id', taskIds);

    if (deleteError) {
      console.error('Error deleting tasks:', deleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete tasks', details: deleteError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        purgedTasks: count ?? taskIds.length,
        retentionDays,
        storage: storageResult,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Purge soft-deleted tasks function error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unexpected error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

