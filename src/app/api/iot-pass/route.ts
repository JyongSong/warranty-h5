import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { getErrorMessage } from "@/lib/error";
import { normalizeIotPassSn, parseIotPassPayload, serializeIotPass } from "@/lib/iotPass";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { errorResponse } = await requireAdminApi(1);
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(req.url);
    const query = String(searchParams.get("query") ?? "").trim();
    const status = String(searchParams.get("status") ?? "").trim();
    const feature = String(searchParams.get("feature") ?? "").trim();

    const conditions: Record<string, unknown>[] = [];

    if (query) {
      conditions.push({
        OR: [
          // SN 은 대문자로 저장하지만 운영자는 소문자로도 친다.
          { sn: { contains: normalizeIotPassSn(query) } },
          { contact: { contains: query, mode: "insensitive" as const } },
        ],
      });
    }
    if (status) conditions.push({ purchase_status: status });
    if (feature) conditions.push({ feature_code: feature });

    const rows = await prisma.device_feature_upgrades.findMany({
      where: conditions.length > 0 ? { AND: conditions } : undefined,
      orderBy: [{ updated_at: "desc" }],
      take: 500,
    });

    // 모델명은 출고 기기 목록에서 한 번에 끌어온다. 줄마다 조회하면 느리다.
    const shipped = await prisma.shippedDevice.findMany({
      where: { sn: { in: rows.map((row) => row.sn) } },
      select: { sn: true, model: true },
    });
    const shippedBySn = new Map(shipped.map((device) => [device.sn, device]));

    return NextResponse.json({
      items: rows.map((row) => serializeIotPass(row, shippedBySn.get(row.sn) ?? null)),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "UNKNOWN_ERROR") }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { errorResponse } = await requireAdminApi(1);
    if (errorResponse) return errorResponse;

    const body = await req.json();
    const data = parseIotPassPayload(body);

    const existing = await prisma.device_feature_upgrades.findUnique({
      where: { sn: data.sn },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "이미 등록된 SN 입니다. 목록에서 해당 기기를 열어 수정해 주세요." },
        { status: 409 },
      );
    }

    const item = await prisma.device_feature_upgrades.create({ data });

    return NextResponse.json({ ok: true, item: serializeIotPass(item, null) });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "UNKNOWN_ERROR") }, { status: 400 });
  }
}
