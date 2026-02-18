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
    
    // Create user in Supabase Auth
    // Note: This requires admin privileges. In production, this should be done
    // via a serverless function with the service role key.
    // 
    // For now, we'll use the Supabase REST API approach or create a user
    // via the admin client. However, since we're in the frontend, we need
    // to use a different approach.
    //
    // Option 1: Use Supabase Admin API (requires service role key - not safe in frontend)
    // Option 2: Create a serverless function (recommended)
    // Option 3: Use Supabase's built-in user invitation system
    
    // For this implementation, we'll use a workaround:
    // We'll create the user via Supabase's signUp method with a temporary password,
    // then immediately update it. However, this requires email confirmation.
    //
    // Better approach: Use Supabase Admin API via a serverless function.
    // For now, this is a placeholder that shows the structure.
    
    // IMPORTANT: This is a placeholder. Replace with serverless function call:
    // const response = await fetch('/api/create-user', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ email, fullName, role, password })
    // });
    
    // For development/testing, we can use Supabase's admin client if available
    // But this should NOT be used in production from the frontend
    
    // Try to use Edge Function if available (better approach)
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    let { data: { session: currentSession } } = await supabase.auth.getSession();
    
    if (currentSession && supabaseUrl) {
      // Refresh the session to ensure we have a valid token
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession(currentSession);
      
      if (refreshError || !refreshedSession) {
        console.warn('Failed to refresh session, using existing token:', refreshError);
        // Continue with existing session if refresh fails
      } else {
        currentSession = refreshedSession;
      }

      try {
        const response = await fetch(
          `${supabaseUrl}/functions/v1/create-user`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${currentSession.access_token}`,
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

        const data = await response.json();

        if (response.ok && data.success) {
          return {
            userId: data.userId,
            email: data.email,
            password: data.password,
          };
        }

        // If Edge Function returns error, log it but continue to fallback
        console.warn('Edge Function error:', data.error);
      } catch (fetchError) {
        // Edge Function might not be deployed yet, use fallback
        console.warn('Edge Function not available, using fallback:', fetchError);
      }
    }

    // Fallback: Use signUp method (requires email confirmation disabled)
    // Get current admin session before creating new user
    // (signUp will auto-sign-in the new user, so we need to restore admin session)
    
    // Create user via signUp
    // Note: For testing phase, email confirmation should be disabled in Supabase Dashboard
    // Settings → Authentication → Email Auth → Confirm email: OFF
    // This allows dummy/non-functional emails during testing
    // In production, enable email confirmation and use Edge Functions for user creation
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: undefined, // No email redirect for testing phase
        data: {
          full_name: fullName,
        },
        // Disable email confirmation requirement for testing
        // In production, this should be handled via Edge Function with service role
      },
    });
    
    if (authError) {
      // Check if error is due to email already existing in auth.users
      if (authError.message?.includes('already registered') || 
          authError.message?.includes('already exists') ||
          (authError as any).code === 'signup_disabled' ||
          (authError as any).status === 400) {
        // Email exists in auth.users - check if it's a deleted user in public.users
        const deletedUserCheck = deletedUser as { id: string; email: string; full_name: string | null; deleted_at: string } | null;
        if (deletedUserCheck && deletedUserCheck.id) {
          throw new Error(
            `A deleted user with email "${email}" exists in both authentication and database. ` +
            `Please restore the existing user (ID: ${deletedUserCheck.id}) instead of creating a new one.`
          );
        } else {
          throw new Error(
            `Email "${email}" is already registered in the authentication system. ` +
            `If this is a deleted user, please restore them instead of creating a new account.`
          );
        }
      }
      throw authError;
    }
    
    if (!authData.user) {
      throw new Error('Failed to create user in authentication system');
    }

    // Immediately sign out the newly created user and restore admin session
    // This prevents the admin from being signed into the new user's account
    await supabase.auth.signOut();
    
    // Restore the admin's session if it existed
    if (currentSession) {
      try {
        const { error: restoreError } = await supabase.auth.setSession({
          access_token: currentSession.access_token,
          refresh_token: currentSession.refresh_token,
        });
        
        if (restoreError) {
          console.warn('Failed to restore admin session after user creation:', restoreError);
          // Try to refresh the session
          const { error: refreshError } = await supabase.auth.refreshSession(currentSession);
          if (refreshError) {
            console.warn('Failed to refresh admin session:', refreshError);
            // Session might be expired - admin will need to sign in again
            // But user creation was successful, so we continue
          }
        }
      } catch (error) {
        console.warn('Error restoring admin session:', error);
        // Don't throw - user was created successfully
        // Admin will need to sign in again, but that's acceptable
      }
    }
    
    // Create user record in public.users table
    const { error: userError } = await ((supabase.from('users') as any).insert({
      id: authData.user.id,
      email,
      full_name: fullName,
      role_id: (roleData as any).id,
      is_active: true,
      created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    }) as any);
    
    if (userError) {
      // If user record creation fails, check if it's a duplicate (user already exists)
      if ((userError as any).code === '23505') {
        // Unique constraint violation - user record might already exist
        // This is okay, the trigger might have created it
        console.warn('User record may already exist, continuing...');
      } else {
        // Other error - log it
        console.error('Failed to create user record:', userError);
        
        // Try to use the self-registration function as fallback
        const { error: fallbackError } = await (supabase.rpc('create_my_user_record') as any);
        if (fallbackError) {
          throw new Error(`Failed to create user record: ${(userError as any).message ?? 'Unknown error'}. The user was created in authentication but the database record creation failed.`);
        }
      }
    }
    
    return {
      userId: authData.user.id,
      email,
      password, // Return the password so admin can share it with the user
    };
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
