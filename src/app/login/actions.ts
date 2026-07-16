"use server";

import { cookies } from "next/headers";
import { getErrorMessage } from "@/lib/error";
import {
  changeBackofficePassword,
  createBackofficeSupabaseClient,
  signInBackofficeWithPassword,
  type SupabaseCookieToSet,
} from "@/lib/login/backofficeAuth";

type ActionError = {
  ok: false;
  error: string;
};

export async function signInBackofficeAction(
  email: string,
  password: string,
): Promise<
  | {
      ok: true;
      user: { email: string; level: number };
    }
  | ActionError
> {
  try {
    const cookiesToSet: SupabaseCookieToSet[] = [];
    const user = await signInBackofficeWithPassword(email, password, cookiesToSet);
    await setSupabaseCookies(cookiesToSet);

    return {
      ok: true,
      user: {
        email: user.email,
        level: user.level,
      },
    };
  } catch (error: unknown) {
    return { ok: false, error: getErrorMessage(error, "AUTH_FAILED") };
  }
}

export async function signOutBackofficeAction(): Promise<{ ok: true } | ActionError> {
  try {
    const cookiesToSet: SupabaseCookieToSet[] = [];
    const supabase = await createBackofficeSupabaseClient(cookiesToSet);
    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    await setSupabaseCookies(cookiesToSet);
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error: getErrorMessage(error, "LOGOUT_FAILED") };
  }
}

export async function changeBackofficePasswordAction({
  currentPassword,
  newPassword,
  confirmPassword,
}: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ ok: true } | ActionError> {
  try {
    if (newPassword !== confirmPassword) {
      throw new Error("PASSWORD_CONFIRMATION_MISMATCH");
    }

    const cookiesToSet: SupabaseCookieToSet[] = [];
    await changeBackofficePassword(currentPassword, newPassword, cookiesToSet);
    await setSupabaseCookies(cookiesToSet);

    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, error: getErrorMessage(error, "PASSWORD_CHANGE_FAILED") };
  }
}

async function setSupabaseCookies(cookiesToSet: SupabaseCookieToSet[]) {
  const cookieStore = await cookies();

  for (const cookie of cookiesToSet) {
    cookieStore.set(cookie.name, cookie.value, cookie.options);
  }
}
