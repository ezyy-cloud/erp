// Supabase Edge Function: Reset User Password
// This function uses the Admin API (service role) to reset a user's password
// It can only be called by authenticated admins/super_admins

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400', // 24 hours
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 200, // Use 200 instead of 204 for better CORS compatibility
      headers: corsHeaders
    });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract the token from the Authorization header
    const token = authHeader.replace('Bearer ', '');

    // Initialize Supabase client with anon key for user verification
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

    // Verify the JWT token using getUser (more tolerant than getClaims)
    const { data: callerUser, error: callerUserError } = await supabase.auth.getUser(token);

    if (callerUserError || !callerUser?.user) {
      return new Response(
        JSON.stringify({ 
          error: callerUserError?.message ?? 'Invalid JWT',
          details: 'Invalid or expired JWT token. Please refresh your session and try again.'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callerUserId = callerUser.user.id;

    // Get full user details using Admin API (since we have service role key)
    const adminClientForCaller = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: { user: currentUser }, error: adminUserError } = await adminClientForCaller.auth.admin.getUserById(callerUserId);

    if (adminUserError || !currentUser) {
      return new Response(
        JSON.stringify({ 
          error: adminUserError?.message ?? 'User not found',
          details: 'Could not retrieve user information from token.'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user is an admin or super_admin
    // Fetch user and role separately to avoid RLS issues with joins
    const { data: callerUserData, error: callerRoleError } = await supabase
      .from('users')
      .select('role_id')
      .eq('id', currentUser.id)
      .single();

    if (callerRoleError || !callerUserData || !callerUserData.role_id) {
      return new Response(
        JSON.stringify({ error: `User not found or has no role: ${callerRoleError?.message ?? 'Unknown error'}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch role separately
    const { data: callerRoleData, error: callerRoleFetchError } = await supabase
      .from('roles')
      .select('name')
      .eq('id', callerUserData.role_id)
      .single();

    if (callerRoleFetchError || !callerRoleData) {
      return new Response(
        JSON.stringify({ error: `Role not found: ${callerRoleFetchError?.message ?? 'Unknown error'}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const roleName = callerRoleData.name;
    if (roleName !== 'admin' && roleName !== 'super_admin') {
      return new Response(
        JSON.stringify({ error: `Insufficient permissions. Admin or super_admin required. Current role: ${roleName}` }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { userId: targetUserId } = await req.json();

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ error: 'Missing userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate a secure password
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    password += '0123456789'[Math.floor(Math.random() * 10)];
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)];
    for (let i = password.length; i < 12; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    // Shuffle
    password = password.split('').sort(() => Math.random() - 0.5).join('');

    // Create admin client with service role key to update password
    const adminClientForReset = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Update the user's password in auth.users
    const { data: updateData, error: updateError } = await adminClientForReset.auth.admin.updateUserById(
      targetUserId,
      { password }
    );

    if (updateError) {
      return new Response(
        JSON.stringify({ error: `Failed to update password: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId: targetUserId,
        email: updateData.user.email,
        password, // Return the password so admin can share it
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
