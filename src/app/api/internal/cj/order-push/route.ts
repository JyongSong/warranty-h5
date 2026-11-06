import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { CJ_ORDER_PUSH_JOB, recordCronJobCalled, recordCronJobFinished } from "@/lib/cron/status";
import { parseItemCodes, type CjDeliveryRow } from "@/lib/installation/cj/cj-api";
import { CJ_ORDER_PUSH_MAX_ROWS, saveCjOrderPush } from "@/lib/installation/cj/cj-order-push";

export const dynamic = "force-dynamic";

// 회사 PC(scripts/cj-order-push.mjs)가 CJ API 로 조회한 출고 주문을 받는다.
// 인증: Authorization: Bearer <CJ_ORDER_PUSH_SECRET>
// 본문: { startDate, endDate, rows: [{ orderNo, orderItemSequence,
//         orderDetailSequence, orderProcessingSequence, paymentDate, itemCode }] }
// 개인정보 필드가 섞여 와도 위 필드만 꺼내 쓴다.

function isAuthorized(request: Request) {
  const secret = process.env.CJ_ORDER_PUSH_SECRET?.trim();
  if (!secret || secret.length < 32) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function pickString(value: unknown) {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : null;
}

function parseBody(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const { startDate, endDate, rows } = body as Record<string, unknown>;
  if (typeof startDate !== "string" || !DATE.test(startDate)) return null;
  if (typeof endDate !== "string" || !DATE.test(endDate)) return null;
  if (!Array.isArray(rows) || rows.length > CJ_ORDER_PUSH_MAX_ROWS) return null;

  const picked: CjDeliveryRow[] = rows.map((raw) => {
    const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
      orderNo: pickString(row.orderNo),
      orderItemSequence: pickString(row.orderItemSequence),
      orderDetailSequence: pickString(row.orderDetailSequence),
      orderProcessingSequence: pickString(row.orderProcessingSequence),
      paymentDate: pickString(row.paymentDate),
      itemCode: pickString(row.itemCode),
    };
  });
  return { startDate, endDate, rows: picked };
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }
  const parsed = parseBody(body);
  if (!parsed) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  await recordCronJobCalled(CJ_ORDER_PUSH_JOB);
  const startedAt = new Date();
  try {
    const result = await saveCjOrderPush({
      rows: parsed.rows,
      itemCodes: parseItemCodes(process.env.CJ_ITEM_CODES),
      label: `CJ API 출고일 ${parsed.startDate} ~ ${parsed.endDate}`,
    });
    await recordCronJobFinished(CJ_ORDER_PUSH_JOB, "SUCCESS", startedAt, null);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cj/order-push]", error);
    await recordCronJobFinished(CJ_ORDER_PUSH_JOB, "FAILED", startedAt, "CJ_ORDER_PUSH_FAILED");
    return NextResponse.json({ ok: false, error: "CJ_ORDER_PUSH_FAILED" }, { status: 500 });
  }
}
