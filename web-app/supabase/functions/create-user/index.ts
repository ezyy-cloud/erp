// Supabase Edge Function: Create User
// This function uses the Admin API (service role) to create a new user
// It can only be called by authenticated admins/super_admins

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 200, // Use 200 instead of 204 for better CORS compatibility
      headers: corsHeaders,
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

    // Create clients: anon for JWT verification, admin for DB and auth
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify JWT: try getClaims first (recommended for asymmetric JWT signing), then getUser
    let callerUserId: string;

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (!claimsError && claimsData?.claims?.sub) {
      callerUserId = claimsData.claims.sub as string;
    } else {
      const { data: callerUser, error: callerUserError } = await supabase.auth.getUser(token);
      if (callerUserError || !callerUser?.user) {
        return new Response(
          JSON.stringify({
            error: callerUserError?.message ?? claimsError?.message ?? 'Invalid JWT',
            details: 'Invalid or expired JWT token. Please refresh your session and try again.',
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      callerUserId = callerUser.user.id;
    }

    const { data: { user: currentUser }, error: adminUserError } = await adminClient.auth.admin.getUserById(callerUserId);

    if (adminUserError || !currentUser) {
      return new Response(
        JSON.stringify({
          error: adminUserError?.message ?? 'User not found',
          details: 'Could not retrieve user information from token.',
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user is an admin or super_admin (use adminClient to avoid RLS)
    const { data: callerUserData, error: callerRoleError } = await adminClient
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

    const { data: callerRoleData, error: callerRoleFetchError } = await adminClient
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
    const { email, fullName, role, password } = await req.json();

    if (!email || !fullName || !role || !password) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, fullName, role, password' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the role ID
    const { data: targetRoleData, error: targetRoleError } = await adminClient
      .from('roles')
      .select('id')
      .eq('name', role)
      .single();

    if (targetRoleError || !targetRoleData) {
      return new Response(
        JSON.stringify({ error: `Role '${role}' not found` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client with service role key
    // Create user in auth.users using Admin API
    const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm the user
      user_metadata: {
        full_name: fullName,
      },
    });

    if (createError || !authData.user) {
      return new Response(
        JSON.stringify({ error: `Failed to create user: ${createError?.message ?? 'Unknown error'}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create user record in public.users table
    const { error: userRecordError } = await adminClient
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        full_name: fullName,
        role_id: targetRoleData.id,
        is_active: true,
        created_by: currentUser.id,
      });

    if (userRecordError) {
      // If user record creation fails, try to clean up the auth user
      // (though we'll continue anyway as the trigger might create it)
      console.error('Failed to create user record:', userRecordError);
      
      // Check if it's a duplicate (trigger might have created it)
      // PostgreSQL unique violation error code is '23505'
      const errorCode = 'code' in userRecordError ? userRecordError.code : null;
      if (errorCode !== '23505') {
        return new Response(
          JSON.stringify({ error: `Failed to create user record: ${userRecordError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Send welcome email via Resend (non-blocking: log errors but never fail user creation)
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (resendApiKey) {
      const appUrl = Deno.env.get('APP_URL') ?? '';
      const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';
      const loginUrl = appUrl ? `${appUrl.replace(/\/$/, '')}/login` : '#';
      const dashboardUrl = appUrl ? `${appUrl.replace(/\/$/, '')}/dashboard` : '#';
      const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;line-height:1.5;">
        <p>Hi ${fullName ?? email},</p>
        <p>Welcome! Your account has been created.</p>
        <p><a href="${loginUrl}">Log in here</a> to get started.</p>
        <p>You can also go to your <a href="${dashboardUrl}">dashboard</a> after signing in.</p>
        <p>If you have any questions, contact your administrator.</p>
      </body></html>`;
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: 'Welcome to Ezyy ERP',
            html,
          }),
        });
        if (!res.ok) {
          const errText = await res.text();
          console.error('Resend welcome email failed:', res.status, errText);
        }
      } catch (e) {
        console.error('Resend welcome email error:', e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId: authData.user.id,
        email,
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
