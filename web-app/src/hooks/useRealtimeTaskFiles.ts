import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/contexts/RealtimeContext';
import type { TaskFile } from '@/lib/supabase/types';

/**
 * Hook to subscribe to real-time task file updates
 * Automatically fetches initial data and subscribes to changes
 */
export function useRealtimeTaskFiles(taskId: string) {
  const { user } = useAuth();
  const { subscribe, isConnected } = useRealtime();
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch initial files
  const fetchFiles = useCallback(async () => {
    if (!user || !taskId) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const { data, error: fetchError } = await supabase
        .from('task_files')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Fetch users separately and generate signed URLs
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((f: any) => f.user_id).filter(Boolean))];
        const { data: usersData } = userIds.length > 0
          ? await supabase.from('users').select('*').in('id', userIds)
          : { data: [] };

        const usersMap = new Map((usersData as any)?.map((u: any) => [u.id, u]) ?? []);

        // Generate signed URLs for each file
        const filesWithUsers = await Promise.all(
          data.map(async (file: any) => {
            const path = file.file_path.startsWith('task-files/')
              ? file.file_path.replace('task-files/', '')
              : file.file_path;

            // Generate signed URL (valid for 1 hour)
            const { data: signedUrlData } = await supabase.storage
              .from('task-files')
              .createSignedUrl(path, 3600);

            return {
              ...file,
              user: usersMap.get(file.user_id) ?? null,
              signedUrl: signedUrlData?.signedUrl ?? null,
            };
          })
        );

        setFiles(filesWithUsers as any);
      } else {
        setFiles([]);
      }
    } catch (err) {
      console.error('Error fetching files:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [user, taskId]);

  // Set up real-time subscription
  useEffect(() => {
    if (!user || !isConnected || !taskId) {
      if (!user || !taskId) {
        setFiles([]);
        setLoading(false);
      }
      return;
    }

    // Initial fetch
    fetchFiles();

    // Subscribe to file changes for this task
    const unsubscribe = subscribe(
      `task_files:${user.id}:${taskId}`,
      {
        event: '*',
        schema: 'public',
        table: 'task_files',
        filter: `task_id=eq.${taskId}`,
        callback: async (payload) => {
          if (payload.eventType === 'INSERT') {
            const newFile = payload.new as TaskFile;

            // Fetch user and generate signed URL
            let userData = null;
            if (newFile.user_id) {
              const { data } = await supabase
                .from('users')
                .select('*')
                .eq('id', newFile.user_id)
                .single();
              userData = data;
            }

            const path = newFile.file_path.startsWith('task-files/')
              ? newFile.file_path.replace('task-files/', '')
              : newFile.file_path;

            const { data: signedUrlData } = await supabase.storage
              .from('task-files')
              .createSignedUrl(path, 3600);

            setFiles((prev) => {
              // Check if file already exists (avoid duplicates)
              if (prev.some((f) => f.id === newFile.id)) {
                return prev;
              }
              return [
                {
                  ...newFile,
                  user: userData,
                  signedUrl: signedUrlData?.signedUrl ?? null,
                } as any,
                ...prev,
              ];
            });
          } else if (payload.eventType === 'DELETE') {
            const deletedFile = payload.old as TaskFile;
            setFiles((prev) => prev.filter((f) => f.id !== deletedFile.id));
          }
        },
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user, isConnected, taskId, fetchFiles, subscribe]);

  return { files, loading, error, refetch: fetchFiles };
}
