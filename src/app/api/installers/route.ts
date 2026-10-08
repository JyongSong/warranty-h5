import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import { normalizePhone } from "@/lib/phone";
import { parseInstallerPayload } from "@/lib/installer";
import { requireAdminApi } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { errorResponse } = await requireAdminApi(1);
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
      // 기사 앱은 로그인 후 알림을 허용하면 기기 토큰을 올린다. 토큰이 있으면
      // 앱을 설치해 쓰고 있다는 뜻이다 (브라우저 접속은 토큰을 올리지 않는다).
      include: {
        devices: { select: { lastSeenAt: true }, orderBy: { lastSeenAt: "desc" }, take: 1 },
      },
    });

    const items = rows.map(({ devices, ...installer }) => ({
      ...installer,
      appLastSeenAt: devices[0]?.lastSeenAt ?? null,
    }));

    return NextResponse.json({ items });
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
