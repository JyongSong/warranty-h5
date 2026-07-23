import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_ASSIGNMENT_SMS_TEMPLATE,
  SMS_TEMPLATE_KEYS,
} from "@/lib/smsTemplate";
import { decryptPii } from "@/lib/piiCrypto";

export const dynamic = "force-dynamic";

function tryDecryptBackofficeEmail(emailEncrypted: string) {
  try {
    return decryptPii(emailEncrypted);
  } catch {
    return null;
  }
}

const DEFAULTS: Record<string, string> = {
  [SMS_TEMPLATE_KEYS.ASSIGNMENT]: DEFAULT_ASSIGNMENT_SMS_TEMPLATE,
};

function getDefault(key: string): string | null {
  return DEFAULTS[key] ?? null;
}

type Ctx = { params: Promise<{ key: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { errorResponse } = await requireAdminApi(1);
  if (errorResponse) return errorResponse;

  const { key } = await ctx.params;
  const fallback = getDefault(key);
  if (fallback == null) {
    return NextResponse.json({ error: "unknown template key" }, { status: 404 });
  }

  const row = await prisma.smsTemplate.findUnique({ where: { key } });
  let updatedByName: string | null = null;
  if (row?.updatedBy) {
    const boUser = await prisma.backofficeUser.findUnique({
      where: { id: row.updatedBy },
      select: { emailEncrypted: true },
    });
    if (boUser) {
      const email = tryDecryptBackofficeEmail(boUser.emailEncrypted);
      updatedByName = email ? email.split("@")[0] : null;
    } else {
      updatedByName = (
        await prisma.admin.findUnique({
          where: { id: row.updatedBy },
          select: { name: true },
        })
      )?.name ?? null;
    }
  }


  return NextResponse.json({
    key,
    body: row?.body ?? fallback,
    default: fallback,
    customized: Boolean(row),
    updatedAt: row?.updatedAt ?? null,
    updatedBy: updatedByName,
  });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { admin, errorResponse } = await requireAdminApi(1);
  if (errorResponse) return errorResponse;

  const { key } = await ctx.params;
  const fallback = getDefault(key);
  if (fallback == null) {
    return NextResponse.json({ error: "unknown template key" }, { status: 404 });
  }

  let payload: { body?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  if (body.length > 1000) {
    return NextResponse.json({ error: "body too long (max 1000 chars)" }, { status: 400 });
  }

  const saved = await prisma.smsTemplate.upsert({
    where: { key },
    create: { key, body, updatedBy: admin!.id },
    update: { body, updatedBy: admin!.id },
  });

  return NextResponse.json({
    key,
    body: saved.body,
    default: fallback,
    customized: true,
    updatedAt: saved.updatedAt,
    updatedBy: admin!.name,
  });
}
