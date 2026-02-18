import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtime } from '@/contexts/RealtimeContext';
import type { UserWithRole } from '@/lib/supabase/types';

export interface ProjectMemberWithUser {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  created_at: string;
  created_by: string | null;
  user: UserWithRole | null;
}

/**
 * Hook to subscribe to real-time project members updates
 * @param projectId - The project ID to fetch members for
 */
export function useRealtimeProjectMembers(projectId: string | undefined) {
  const { user } = useAuth();
  const { subscribe, isConnected } = useRealtime();
  const [members, setMembers] = useState<ProjectMemberWithUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMembers = useCallback(async () => {
    if (!user || !projectId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data: membersData, error: membersError } = await supabase
        .from('project_members')
        .select('*')
        .eq('project_id', projectId);

      if (membersError) throw membersError;

      if (membersData && membersData.length > 0) {
        const userIds = [...new Set(membersData.map((m: any) => m.user_id).filter(Boolean))];

        const { data: usersData, error: usersError } =
          userIds.length > 0
            ? await supabase
                .from('users')
                .select('*, roles:roles!users_role_id_fkey(*)')
                .in('id', userIds)
            : { data: [], error: null };

        if (usersError) throw usersError;

        const usersMap = new Map(
          (usersData as any)?.map((u: any) => [
            u.id,
            {
              ...u,
              roles: Array.isArray(u.roles) && u.roles.length > 0 ? u.roles[0] : (u.roles ?? null),
            } as UserWithRole,
          ]) ?? []
        );

        const membersWithUsers = membersData.map((member: any) => ({
          ...member,
          user: usersMap.get(member.user_id) ?? null,
        }));

        setMembers(membersWithUsers as ProjectMemberWithUser[]);
      } else {
        setMembers([]);
      }
    } catch (err) {
      console.error('Error fetching project members:', err);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [user, projectId]);

  useEffect(() => {
    if (!user || !isConnected || !projectId) {
      if (!user || !projectId) {
        setMembers([]);
        setLoading(false);
      }
      return;
    }

    fetchMembers();

    const unsubscribe = subscribe(
      `project_members:${user.id}:${projectId}`,
      {
        event: '*',
        schema: 'public',
        table: 'project_members',
        filter: `project_id=eq.${projectId}`,
        callback: () => {
          fetchMembers();
        },
      }
    );

    return () => unsubscribe();
  }, [user, isConnected, projectId, fetchMembers, subscribe]);

  return { members, loading, refetch: fetchMembers };
}
