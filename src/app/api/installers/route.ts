import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import { normalizePhone } from "@/lib/phone";
import { parseInstallerPayload } from "@/lib/installer";
import { requireAdminApi } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { errorResponse } = await requireAdminApi();
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(req.url);
    const query = String(searchParams.get("query") ?? "").trim();
    const branch = String(searchParams.get("branch") ?? "").trim();
    const region = String(searchParams.get("region") ?? "").trim();
    const capabilitiesRaw = String(searchParams.get("capabilities") ?? "").trim();
    const capabilities = capabilitiesRaw
      ? capabilitiesRaw.split(",").map((c) => c.trim()).filter(Boolean)
      : [];

    const conditions: Record<string, unknown>[] = [];

    if (query) {
      const phone = normalizePhone(query);
      conditions.push({
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { phone: { contains: phone || query } },
        ],
      });
    }
    if (branch) {
      conditions.push({ branch: { contains: branch, mode: "insensitive" as const } });
    }
    if (region) {
      conditions.push({ region: { contains: region, mode: "insensitive" as const } });
    }
    if (capabilities.length > 0) {
      conditions.push({ capabilities: { hasEvery: capabilities } });
    }

    const filters = conditions.length > 0 ? { AND: conditions } : undefined;

    const rows = await prisma.installer.findMany({
      where: filters,
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      take: 500,
    });

    return NextResponse.json({ items: rows });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "UNKNOWN_ERROR") },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { errorResponse } = await requireAdminApi(1);
    if (errorResponse) return errorResponse;

    const body = await req.json();
    const data = parseInstallerPayload(body);

    const item = await prisma.installer.create({
      data,
    });

    return NextResponse.json({ ok: true, item });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "UNKNOWN_ERROR") },
      { status: 400 }
    );
  }
}
