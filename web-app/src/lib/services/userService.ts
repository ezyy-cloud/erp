import { supabase } from '@/lib/supabase/client';
import type { UserRole } from '@/lib/supabase/types';

export interface CreateUserParams {
  email: string;
  fullName: string;
  role: UserRole;
  password?: string;
}

export interface CreateUserResult {
  userId: string;
  email: string;
  password: string;
  error?: Error;
}

/**
 * Generate a secure random password
 */
function generatePassword(length: number = 12): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  // Ensure at least one of each required character type
  password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // uppercase
  password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // lowercase
  password += '0123456789'[Math.floor(Math.random() * 10)]; // number
  password += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // special
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Create a new user in the system
 * 
 * Note: This function requires admin privileges. In production, this should
 * be moved to a serverless function (Supabase Edge Function) that has access
 * to the service role key, as the frontend should not have admin access.
 * 
 * For now, this uses Supabase's admin API which requires the service role key.
 * This is a placeholder implementation that should be replaced with a backend call.
 * 
 * @param params User creation parameters
 * @returns User credentials and ID
 */
export async function createUser(params: CreateUserParams): Promise<CreateUserResult> {
  const { email, fullName, role, password: providedPassword } = params;
  
  // Generate password if not provided
  const password = providedPassword ?? generatePassword(12);
  
  // Check for existing users (deleted or active) before attempting creation
  let deletedUser: { id: string; email: string; full_name: string | null; deleted_at: string } | null = null;
  
  try {
    // Check if a deleted user exists with this email
    const { data: deletedUserData } = await supabase
      .from('users')
      .select('id, email, full_name, deleted_at')
      .eq('email', email)
      .not('deleted_at', 'is', null)
      .maybeSingle();

    deletedUser = deletedUserData as { id: string; email: string; full_name: string | null; deleted_at: string } | null;

    if (deletedUser) {
      throw new Error(
        `A deleted user with email "${email}" already exists. ` +
        `Please restore the existing user instead of creating a new one. ` +
        `User ID: ${deletedUser.id}`
      );
    }

    // Check if an active user exists with this email
    const { data: activeUser } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .is('deleted_at', null)
      .maybeSingle();

    if (activeUser) {
      throw new Error(
        `A user with email "${email}" already exists. ` +
        `Please use a different email address.`
      );
    }

    // Get the role ID for the specified role
    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .select('id')
      .eq('name', role)
      .single();
    
    if (roleError || !roleData) {
      throw new Error(`Role '${role}' not found`);
    }
    
    // User creation is done only via the create-user Edge Function (service role) so the admin session is never touched.
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const { data: { session: currentSession } } = await supabase.auth.getSession();

    if (!currentSession) {
      throw new Error('Not authenticated. Please sign in to create users.');
    }
    if (!supabaseUrl) {
      throw new Error('Missing Supabase URL. Check VITE_SUPABASE_URL in your environment.');
    }

    const refreshed = await supabase.auth.refreshSession(currentSession);
    if (refreshed.error) {
      throw new Error('Session expired or invalid. Please sign in again.');
    }
    const session = refreshed.data.session ?? currentSession;
    if (!session) {
      throw new Error('Session expired or invalid. Please sign in again.');
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/create-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
        },
        body: JSON.stringify({
          email,
          fullName,
          role,
          password,
        }),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (response.ok && data.success) {
      return {
        userId: data.userId,
        email: data.email,
        password: data.password,
      };
    }

    let message =
      (typeof data.error === 'string' ? data.error : data.error?.message) ?? null;
    if (!message) {
      if (response.status === 404) {
        message = 'Create-user Edge Function not found. Deploy it with: supabase functions deploy create-user';
      } else if (response.status === 401) {
        message = 'Session expired or invalid. Please sign in again.';
      } else {
        message = 'User creation failed. Try again or contact your administrator.';
      }
    }
    throw new Error(message);
  } catch (error) {
    return {
      userId: '',
      email,
      password,
      error: error as Error,
    };
  }
}

/**
 * Get all users (admin only)
 * Uses join query to fetch users and roles in a single query for better performance
 */
export async function getAllUsers() {
  // Use join query with explicit foreign key relationship
  // Specify the foreign key relationship explicitly: users.role_id -> roles.id
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('*, roles!users_role_id_fkey(*)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  
  if (usersError) {
    // If the explicit foreign key name doesn't work, fall back to separate queries
    if (usersError.code === 'PGRST201' || usersError.message?.includes('relationship')) {
      // Fallback: fetch users and roles separately
      const { data: usersData, error: usersDataError } = await supabase
        .from('users')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      
      if (usersDataError) {
        throw usersDataError;
      }

      if (!usersData || usersData.length === 0) {
        return [];
      }

      // Get unique role IDs
      const roleIds = [...new Set(usersData.map((u: any) => (u as any).role_id).filter(Boolean))];
      
      // Fetch roles separately
      let rolesMap = new Map();
      if (roleIds.length > 0) {
        const { data: roles, error: rolesError } = await supabase
          .from('roles')
          .select('*')
          .in('id', roleIds);
        
        if (rolesError) {
          console.warn('Error fetching roles:', rolesError);
        } else if (roles) {
          rolesMap = new Map((roles as any).map((r: any) => [r.id, r]));
        }
      }

      // Combine users with their roles
      return usersData.map((user: any) => ({
        ...user,
        roles: (user as any).role_id ? rolesMap.get((user as any).role_id) ?? null : null,
      }));
    }
    throw usersError;
  }

  if (!users || users.length === 0) {
    return [];
  }

  // Transform the data to match expected format
  // roles(*) returns an array, but we expect a single role object
  return users.map((user: any) => ({
    ...user,
    roles: Array.isArray(user.roles) && user.roles.length > 0 
      ? user.roles[0] 
      : (user.roles ?? null),
  }));
}

/**
 * Update user role (admin only)
 */
export async function updateUserRole(userId: string, role: UserRole) {
  // Get the role ID
  const { data: roleData, error: roleError } = await supabase
    .from('roles')
    .select('id')
    .eq('name', role)
    .single();
  
  if (roleError || !roleData) {
    throw new Error(`Role '${role}' not found`);
  }
  
  const { error } = await ((supabase
    .from('users') as any)
    .update({ role_id: (roleData as any).id })
    .eq('id', userId) as any);
  
  if (error) {
    throw error;
  }
}

/**
 * Toggle user active status (admin only)
 */
export async function toggleUserStatus(userId: string, isActive: boolean) {
  const { error } = await ((supabase
    .from('users') as any)
    .update({ is_active: isActive })
    .eq('id', userId) as any);
  
  if (error) {
    throw error;
  }
}

export interface UpdateUserParams {
  userId: string;
  email?: string;
  fullName?: string;
  role?: UserRole;
  isActive?: boolean;
}

/**
 * Update user details (admin only)
 */
export async function updateUser(params: UpdateUserParams): Promise<{ error: Error | null }> {
  const { userId, email, fullName, role, isActive } = params;

  try {
    const updateData: Record<string, any> = {};

    if (email !== undefined) {
      updateData.email = email;
    }

    if (fullName !== undefined) {
      updateData.full_name = fullName;
    }

    if (isActive !== undefined) {
      updateData.is_active = isActive;
    }

    if (role !== undefined) {
      // Get the role ID
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .select('id')
        .eq('name', role)
        .single();

      if (roleError || !roleData) {
        return { error: new Error(`Role '${role}' not found`) };
      }

      updateData.role_id = (roleData as any).id;
    }

    // Update user record
    const { error: updateError } = await ((supabase
      .from('users') as any)
      .update(updateData)
      .eq('id', userId) as any);

    if (updateError) {
      return { error: updateError as Error };
    }

    // If email was updated, we should also update it in auth.users
    // However, this requires admin API access which we don't have in frontend
    // In production, this should be done via a serverless function
    if (email !== undefined) {
      console.warn('Email update in auth.users requires admin API. User email in public.users has been updated, but auth.users email may need manual update via Supabase Dashboard or Admin API.');
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export interface ResetPasswordResult {
  password: string;
  error?: Error;
}

/**
 * Reset user password (admin only)
 * 
 * Calls the Supabase Edge Function to reset the user's password.
 * Falls back to generating a password if the Edge Function is not available.
 */
export async function resetUserPassword(userId: string): Promise<ResetPasswordResult> {
  try {
    // Verify user exists
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .single();

    if (userError || !user) {
      return { password: '', error: new Error('User not found') };
    }

    // Get the current session for authorization and refresh if needed
    let { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return { password: '', error: new Error('Not authenticated') };
    }

    // Refresh the session to ensure we have a valid token
    const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession(session);
    
    if (refreshError || !refreshedSession) {
      console.warn('Failed to refresh session, using existing token:', refreshError);
      // Continue with existing session if refresh fails
    } else {
      session = refreshedSession;
    }

    // Get Supabase URL from environment
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    
    // Try to call the Edge Function if available
    if (supabaseUrl) {
      try {
        const functionUrl = `${supabaseUrl}/functions/v1/reset-user-password`;
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
          },
          body: JSON.stringify({ userId }),
        });

        let result;
        try {
          result = await response.json();
        } catch (jsonError) {
          // Response might not be JSON (e.g., HTML error page)
          console.warn('Failed to parse Edge Function response as JSON:', jsonError);
          throw new Error('Invalid response from Edge Function');
        }

        console.log('Edge Function response:', { status: response.status, ok: response.ok, result }); // Debug log

        if (response.ok && result.success && result.password) {
          // Success! Password was set via Edge Function
          console.log('Password reset successful via Edge Function:', result.password); // Debug log
          return {
            password: result.password,
          };
        }

        // Edge function was called but returned an error
        // Extract the error message from the response
        const errorMessage = result.error || result.message || `Edge Function returned status ${response.status}`;
        console.warn('Edge function error:', {
          status: response.status,
          ok: response.ok,
          success: result.success,
          password: result.password,
          error: errorMessage,
        });

        // Return the password if it was generated, but include the error
        if (result.password) {
          return {
            password: result.password,
            error: new Error(`Edge Function error: ${errorMessage}`),
          };
        }

        // If no password in response, continue to fallback
      } catch (fetchError) {
        // Edge function not reachable (network error, 404, CORS, etc.)
        const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
        const isCorsError = errorMessage.includes('CORS') || errorMessage.includes('Failed to fetch');
        
        if (isCorsError) {
          console.warn('CORS error when calling Edge Function. This usually means:', {
            error: errorMessage,
            possibleCauses: [
              'Edge Function may not be deployed',
              'CORS headers may not be configured correctly',
              'Check if the Edge Function is accessible at the URL',
            ],
          });
        } else {
          console.warn('Edge function not reachable, using fallback:', fetchError);
        }
      }
    }

    // Fallback: Generate password but don't set it in auth.users
    // Admin will need to set it manually or via Supabase Dashboard
    const newPassword = generatePassword(12);
    console.log('Generated fallback password:', newPassword); // Debug log

    return {
      password: newPassword,
      error: new Error(
        'Edge Function is not reachable or not deployed. Password generated but not set in auth.users. Please check the Edge Function deployment or set the password manually in Supabase Dashboard.'
      ),
    };
  } catch (error) {
    return {
      password: '',
      error: error as Error,
    };
  }
}
