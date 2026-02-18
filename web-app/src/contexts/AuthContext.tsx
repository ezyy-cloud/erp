import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { UserWithRole, UserRole } from '@/lib/supabase/types';
import { getPermissions, type Permissions } from '@/lib/rbac/permissions';

interface AuthContextType {
  user: User | null;
  appUser: UserWithRole | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  permissions: Permissions;
  role: UserRole | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<UserWithRole | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Helper function to sign out and clear state (used internally)
  const performSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Continue even if signOut fails
    }
    
    // Clear service worker caches for security
    try {
      const { clearServiceWorkerCaches } = await import('@/lib/pwa/serviceWorkerRegistration');
      await clearServiceWorkerCaches();
    } catch {
      // Continue with logout even if cache clearing fails
    }
    
    // Clear IndexedDB offline queue
    try {
      const { clearQueue } = await import('@/lib/pwa/offlineQueue');
      await clearQueue();
    } catch {
      // Continue with logout even if queue clearing fails
    }
    
    setAppUser(null);
    setUser(null);
    setSession(null);
    // Force a page reload to ensure clean state
    window.location.href = '/login';
  };

  // Check if user is deleted or inactive and sign them out if so
  const checkUserStatusAndSignOut = async (userData: any) => {
    const isDeleted = userData?.deleted_at != null;
    const isInactive = userData?.is_active === false;

    if (isDeleted || isInactive) {
      // User is deleted or inactive - sign them out immediately
      await performSignOut();
      return true; // Indicates user was signed out
    }
    return false; // User is valid
  };

  // Fetch app user data (with role) from our users table
  const fetchAppUser = async (userId: string) => {
    try {
      // First get the user
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      // If user doesn't exist in public.users, try to create it
      if (userError && (userError as any).code === 'PGRST116') {
        // User record doesn't exist - try to sync it
        // Try to call the self-registration function first (simpler, user-specific)
        const { error: createError } = await supabase.rpc('create_my_user_record');
        
        if (!createError) {
          // Successfully created, retry fetching
          const { data: retryUserData, error: retryError } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

          if (!retryError && retryUserData) {
            // Fetch role
            let roleData = null;
            if ((retryUserData as any).role_id) {
              const { data: role } = await supabase
                .from('roles')
                .select('*')
                .eq('id', (retryUserData as any).role_id)
                .single();
              roleData = role;
            }

            const userWithRole = {
              ...(retryUserData as any),
              roles: roleData ?? undefined,
            } as UserWithRole;
            
            // Check if user is deleted or inactive
            const wasSignedOut = await checkUserStatusAndSignOut(retryUserData);
            if (wasSignedOut) {
              return; // User was signed out, don't set appUser
            }
            
            setAppUser(userWithRole);
            return;
          }
        }

        // If self-registration failed, try the sync function
        const { error: syncError } = await supabase.rpc('sync_missing_user_records');
        
        if (syncError) {
          // If both functions fail, don't crash
          return;
        }

        // If sync succeeded, retry fetching
        const { data: retryUserData, error: retryError } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();

        if (retryError || !retryUserData) {
          return;
        }

        // Use the synced user data
        const userWithRole = {
          ...(retryUserData as any),
          roles: null, // Will be fetched below
        } as UserWithRole;
        
        // Fetch role separately
        if ((retryUserData as any).role_id) {
          const { data: role } = await supabase
            .from('roles')
            .select('*')
            .eq('id', (retryUserData as any).role_id)
            .single();
          userWithRole.roles = role ?? undefined;
        }
        
        // Check if user is deleted or inactive
        const wasSignedOut = await checkUserStatusAndSignOut(retryUserData);
        if (wasSignedOut) {
          return; // User was signed out, don't set appUser
        }
        
        setAppUser(userWithRole);
        return;
      }

      if (userError) throw userError;
      if (!userData) return;

      // Check if user is deleted or inactive BEFORE fetching role
      const wasSignedOut = await checkUserStatusAndSignOut(userData);
      if (wasSignedOut) {
        return; // User was signed out, don't set appUser
      }

      // Then get the role separately to avoid relationship ambiguity
      let roleData = null;
      if ((userData as any).role_id) {
        const { data: role } = await supabase
          .from('roles')
          .select('*')
          .eq('id', (userData as any).role_id)
          .single();
        roleData = role;
      }

      const userWithRole = {
        ...(userData as any),
        roles: roleData,
      } as UserWithRole;
      
      setAppUser(userWithRole);
    } catch {
      // Don't completely fail - user might still be authenticated in Supabase Auth
      // Just set appUser to null so the app can continue (though with limited functionality)
      setAppUser(null);
    }
  };

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchAppUser(session.user.id);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchAppUser(session.user.id);
      } else {
        setAppUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error };
      }

      // After successful authentication, check if user is deleted or inactive
      if (data?.user) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('deleted_at, is_active')
          .eq('id', data.user.id)
          .single();

        if (!userError && userData) {
          const user = userData as { deleted_at: string | null; is_active: boolean };
          const isDeleted = user.deleted_at != null;
          const isInactive = user.is_active === false;

          if (isDeleted || isInactive) {
            // Sign out immediately and return error
            await supabase.auth.signOut();
            const reason = isDeleted 
              ? 'Your account has been deleted. Please contact an administrator.'
              : 'Your account has been deactivated. Please contact an administrator.';
            return { error: new Error(reason) };
          }
        }
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  // Deprecated: Public signup is disabled. User creation is now done via admin UI.
  // This function is kept for internal use only (e.g., userService.createUser)
  // @deprecated Use userService.createUser instead for admin user creation
  // Removed unused function to fix build errors

  const signOut = async () => {
    await performSignOut();
  };

  // Get role name from appUser
  const roleName = appUser?.roles?.name ?? null;
  const role = roleName as UserRole | null;
  const permissions = getPermissions(roleName);

  const value: AuthContextType = useMemo(() => ({
    user,
    appUser,
    session,
    loading,
    signIn,
    signOut,
    permissions,
    role,
  }), [user, appUser, session, loading, permissions, role]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
