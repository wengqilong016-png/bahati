// Supabase Edge Function: invite-driver
// Creates a new driver account (auth.users + auto-trigger for drivers table).
// Only callable by authenticated boss users.
//
// Requires environment variables:
//   SUPABASE_URL              – set automatically by Supabase
//   SUPABASE_ANON_KEY         – set automatically by Supabase
//   SUPABASE_SERVICE_ROLE_KEY – set in project secrets

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface InviteBody {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  license_plate?: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Verify the caller is an authenticated boss
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Use anon client with the caller's JWT to verify identity
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: authError } = await callerClient.auth.getUser();
    if (authError || !callerUser) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Check caller has boss role
    const callerRole = callerUser.user_metadata?.role;
    if (callerRole !== 'boss') {
      return new Response(
        JSON.stringify({ error: 'Permission denied: boss only' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2. Parse request body
    const body: InviteBody = await req.json();
    const { email, password, full_name, phone, license_plate } = body;

    if (!email || !password || !full_name) {
      return new Response(
        JSON.stringify({ error: 'email, password, and full_name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 6 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 3. Use service_role client to create the user
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm so driver can log in immediately
      user_metadata: {
        role: 'driver',
        full_name,
        phone: phone ?? null,
      },
    });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 4. Update license_plate if provided (the trigger only sets full_name and phone)
    if (license_plate && newUser.user) {
      const { error: licensePlateError } = await adminClient
        .from('drivers')
        .update({ license_plate })
        .eq('id', newUser.user.id);

      if (licensePlateError) {
        // Roll back: delete the auth user to avoid a partially-initialized driver
        await adminClient.auth.admin.deleteUser(newUser.user.id);

        return new Response(
          JSON.stringify({ error: `Failed to initialize driver record: ${licensePlateError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        driver_id: newUser.user?.id,
        message: `Driver "${full_name}" created successfully`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
