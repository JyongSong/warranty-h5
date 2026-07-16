import "server-only";

import { createClient } from "@supabase/supabase-js";

function createBackofficeAuthAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  const secretKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !secretKey) {
    throw new Error("SUPABASE_AUTH_ADMIN_CONFIG_MISSING");
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function createBackofficeAuthUser(email: string, password: string) {
  const supabase = createBackofficeAuthAdminClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data.user?.id) {
    throw new Error(error?.code || "SUPABASE_USER_CREATE_FAILED");
  }

  return { supabaseUserId: data.user.id };
}

export async function resetBackofficeAuthUserPassword(
  supabaseUserId: string,
  password: string,
) {
  const supabase = createBackofficeAuthAdminClient();
  const { error } = await supabase.auth.admin.updateUserById(supabaseUserId, {
    password,
  });

  if (error) {
    throw new Error(error.code || "SUPABASE_USER_PASSWORD_RESET_FAILED");
  }
}

export async function deleteBackofficeAuthUser(supabaseUserId: string) {
  const supabase = createBackofficeAuthAdminClient();
  const { error } = await supabase.auth.admin.deleteUser(supabaseUserId);

  if (error && error.code !== "user_not_found") {
    throw new Error(error.code || "SUPABASE_USER_DELETE_FAILED");
  }
}
