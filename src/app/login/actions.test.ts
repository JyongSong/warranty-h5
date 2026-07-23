import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  changeBackofficePasswordAction,
  signInBackofficeAction,
  signOutBackofficeAction,
} from "./actions";

const {
  changeBackofficePasswordMock,
  cookieSetMock,
  createBackofficeSupabaseClientMock,
  signInBackofficeWithPasswordMock,
  signOutMock,
} = vi.hoisted(() => ({
  changeBackofficePasswordMock: vi.fn(),
  cookieSetMock: vi.fn(),
  createBackofficeSupabaseClientMock: vi.fn(),
  signInBackofficeWithPasswordMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: cookieSetMock })),
}));

vi.mock("@/lib/login/backofficeAuth", () => ({
  changeBackofficePassword: changeBackofficePasswordMock,
  createBackofficeSupabaseClient: createBackofficeSupabaseClientMock,
  signInBackofficeWithPassword: signInBackofficeWithPasswordMock,
}));

describe("backoffice authentication actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createBackofficeSupabaseClientMock.mockResolvedValue({
      auth: { signOut: signOutMock },
    });
    signOutMock.mockResolvedValue({ error: null });
  });

  it("signs in and writes the Supabase session cookies", async () => {
    signInBackofficeWithPasswordMock.mockImplementation(
      async (_email: string, _password: string, cookiesToSet: unknown[]) => {
        cookiesToSet.push({
          name: "sb-auth",
          value: "session",
          options: { httpOnly: true },
        });
        return { email: "user@example.com", level: 2 };
      },
    );

    await expect(signInBackofficeAction("user@example.com", "password")).resolves.toEqual({
      ok: true,
      user: { email: "user@example.com", level: 2 },
    });
    expect(cookieSetMock).toHaveBeenCalledWith("sb-auth", "session", { httpOnly: true });
  });

  it("returns a stable login error without exposing an exception", async () => {
    signInBackofficeWithPasswordMock.mockRejectedValue(new Error("AUTH_FAILED"));

    await expect(signInBackofficeAction("user@example.com", "wrong")).resolves.toEqual({
      ok: false,
      error: "AUTH_FAILED",
    });
  });

  it("signs out and writes the cleared Supabase cookies", async () => {
    createBackofficeSupabaseClientMock.mockImplementation(async (cookiesToSet: unknown[]) => {
      cookiesToSet.push({ name: "sb-auth", value: "", options: { maxAge: 0 } });
      return { auth: { signOut: signOutMock } };
    });

    await expect(signOutBackofficeAction()).resolves.toEqual({ ok: true });
    expect(signOutMock).toHaveBeenCalledOnce();
    expect(cookieSetMock).toHaveBeenCalledWith("sb-auth", "", { maxAge: 0 });
  });

  it("changes the signed-in user's password", async () => {
    changeBackofficePasswordMock.mockResolvedValue(undefined);

    await expect(
      changeBackofficePasswordAction({
        currentPassword: "current-password",
        newPassword: "new-password",
        confirmPassword: "new-password",
      }),
    ).resolves.toEqual({ ok: true });
    expect(changeBackofficePasswordMock).toHaveBeenCalledWith(
      "current-password",
      "new-password",
      [],
    );
  });

  it("rejects a mismatched password confirmation before calling Supabase", async () => {
    await expect(
      changeBackofficePasswordAction({
        currentPassword: "current-password",
        newPassword: "new-password",
        confirmPassword: "different-password",
      }),
    ).resolves.toEqual({ ok: false, error: "PASSWORD_CONFIRMATION_MISMATCH" });
    expect(changeBackofficePasswordMock).not.toHaveBeenCalled();
  });
});
