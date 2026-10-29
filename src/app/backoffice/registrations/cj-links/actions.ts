"use server";

import { requireAdminApi } from "@/lib/adminAuth";
import { getBaseUrl } from "@/lib/getBaseUrl";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import {
  cjRegConfirmedBy,
  cjRegLinkPath,
  createCjRegLinkToken,
  parseCjRegLinkToken,
} from "@/lib/registration/cjRegLink";
import { parseCjRegLinkWorkbook, type CjRegLinkRow } from "@/lib/registration/cjRegLinkWorkbook";

// CJ 배정 엑셀을 올리면 주문마다 2년 등록 링크(/reg/cj/<token>)를 만들어 문자로 보낸다.
//
// 링크는 올린 시점부터 90일 유효하다. 같은 엑셀을 나중에 다시 올려 보내면 새 90일짜리
// 링크가 나가고, 먼저 보낸 링크도 만료 전까지는 그대로 쓸 수 있다.

export type CjLinkRecipient = CjRegLinkRow & {
  token: string;
  url: string;
  /** 이 주문으로 이미 등록된 대수 */
  registered: number;
};

export type ParseResult =
  | { ok: true; recipients: CjLinkRecipient[]; skipped: number }
  | { ok: false; error: string };

export async function parseCjRegLinkFileAction(formData: FormData): Promise<ParseResult> {
  const { errorResponse } = await requireAdminApi(1);
  if (errorResponse) return { ok: false, error: "UNAUTHORIZED" };

  const file = formData.get("file");
  if (!(typeof file === "object" && file !== null && "arrayBuffer" in file) || file.size === 0) {
    return { ok: false, error: "FILE_REQUIRED" };
  }

  try {
    const { rows, skipped } = parseCjRegLinkWorkbook(Buffer.from(await file.arrayBuffer()));
    if (rows.length === 0) return { ok: false, error: "NO_ROWS" };

    const used = await prisma.warrantyRegistration.groupBy({
      by: ["confirmedBy"],
      where: {
        status: "confirmed",
        confirmedBy: { in: rows.map((row) => cjRegConfirmedBy(row.orderNo)) },
      },
      _count: { _all: true },
    });
    const usedByKey = new Map(used.map((u) => [u.confirmedBy, u._count._all]));

    const baseUrl = getBaseUrl();
    const recipients = rows.map((row) => {
      const token = createCjRegLinkToken(row);
      return {
        ...row,
        token,
        url: `${baseUrl}${cjRegLinkPath(token)}`,
        registered: usedByKey.get(cjRegConfirmedBy(row.orderNo)) ?? 0,
      };
    });

    return { ok: true, recipients, skipped };
  } catch (error) {
    console.error("[registrations/cj-links] parse", error);
    return { ok: false, error: "PARSE_FAILED" };
  }
}

export type SendResult = {
  ok: true;
  sent: number;
  failed: Array<{ orderNo: string; phone: string }>;
};

/**
 * 고른 링크를 문자로 보낸다.
 *
 * 화면에서 받는 것은 토큰뿐이고, 받는 번호는 서명된 토큰 안의 주문 연락처를 쓴다.
 * 서명이 맞지 않는 토큰은 버린다 — 화면 값을 고쳐 다른 번호로 보낼 수 없게 하려는 것이다.
 */
export async function sendCjRegLinksAction(input: {
  tokens: string[];
  body: string;
}): Promise<SendResult | { ok: false; error: string }> {
  const { errorResponse } = await requireAdminApi(1);
  if (errorResponse) return { ok: false, error: "UNAUTHORIZED" };

  const body = String(input.body ?? "").trim();
  if (!body) return { ok: false, error: "BODY_REQUIRED" };
  if (!body.includes("{link}")) return { ok: false, error: "LINK_PLACEHOLDER_REQUIRED" };

  const links = (Array.isArray(input.tokens) ? input.tokens : [])
    .map((token) => ({ token, parsed: parseCjRegLinkToken(token) }))
    .flatMap(({ token, parsed }) => (parsed.ok ? [{ token, link: parsed.link }] : []));
  if (links.length === 0) return { ok: false, error: "NO_RECIPIENTS" };

  const baseUrl = getBaseUrl();
  let sent = 0;
  const failed: Array<{ orderNo: string; phone: string }> = [];

  for (const { token, link } of links) {
    try {
      await sendSms(link.userPhone, body.replaceAll("{link}", `${baseUrl}${cjRegLinkPath(token)}`));
      sent += 1;
    } catch (error) {
      console.error("[registrations/cj-links] send", link.orderNo, error);
      failed.push({ orderNo: link.orderNo, phone: link.userPhone });
    }
  }

  return { ok: true, sent, failed };
}
