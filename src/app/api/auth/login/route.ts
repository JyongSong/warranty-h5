import { NextResponse } from "next/server";
import {
  createManagementSessionToken,
  MANAGEMENT_COOKIE_NAME,
} from "@/lib/adminAuth";
import { getErrorMessage } from "@/lib/error";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body?.code ?? "").trim();

    if (!code) {
      return NextResponse.json({ error: "LOGIN_CODE_REQUIRED" }, { status: 400 });
    }

    const admin = await prisma.admin.findUnique({
      where: { loginCode: code },
      select: {
        id: true,
        name: true,
        level: true,
      },
    });

    if (!admin) {
      return NextResponse.json({ error: "INVALID_LOGIN_CODE" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: MANAGEMENT_COOKIE_NAME,
      value: createManagementSessionToken({ adminId: admin.id }),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "LOGIN_FAILED") },
      { status: 500 }
    );
  }
}
