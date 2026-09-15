"use server";

import { requireAdminApi } from "@/lib/adminAuth";
import { getBaseUrl } from "@/lib/getBaseUrl";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";

// 기사에게 "본인 정보 확인" 링크를 문자로 보낸다.
//
// 링크는 /installer/me/edit 하나뿐이고 사람마다 다르지 않다. 링크를 눌러도
// requireInstallerPage 가 로그인으로 보내고, 본인 휴대폰으로 받은 인증번호를
// 넣어야 들어갈 수 있다. 그래서 링크가 새어 나가도 남의 정보를 볼 수 없다.

const PROFILE_SMS_PATH = "/installer/me/edit";

export type Recipient = {
  id: string;
  name: string;
  phone: string;
  branch: string | null;
  confirmed: boolean;
};

export type RecipientScope = "ROSTER" | "ROSTER_UNCONFIRMED";

function whereForScope(scope: RecipientScope) {
  // 대상은 항상 이번 명단(in_current_roster)이다. 명단 밖 기사에게는 보내지 않는다.
  return scope === "ROSTER_UNCONFIRMED"
    ? { inCurrentRoster: true, profileConfirmedAt: null }
    : { inCurrentRoster: true };
}

export async function listProfileSmsRecipientsAction(
  scope: RecipientScope,
): Promise<{ ok: true; recipients: Recipient[] } | { ok: false; error: string }> {
  const { errorResponse } = await requireAdminApi(1);
  if (errorResponse) return { ok: false, error: "UNAUTHORIZED" };

  const rows = await prisma.installer.findMany({
    where: whereForScope(scope),
    select: { id: true, name: true, phone: true, branch: true, profileConfirmedAt: true },
    orderBy: [{ profileConfirmedAt: "asc" }, { name: "asc" }],
  });

  return {
    ok: true,
    recipients: rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      branch: row.branch,
      confirmed: Boolean(row.profileConfirmedAt),
    })),
  };
}

export type SendResult = {
  ok: true;
  sent: number;
  failed: Array<{ name: string; phone: string }>;
};

/**
 * 고른 기사들에게 문자를 보낸다.
 *
 * installerIds 를 받되 명단 조건을 서버에서 다시 적용한다. 화면에서 온 id 를
 * 그대로 믿으면 명단 밖 기사에게도 보낼 수 있기 때문이다.
 *
 * 한 건이 실패해도 나머지는 계속 보낸다. 실패한 사람만 돌려주어 다시 시도할 수 있게 한다.
 */
export async function sendProfileSmsAction(input: {
  installerIds: string[];
  body: string;
}): Promise<SendResult | { ok: false; error: string }> {
  const { errorResponse } = await requireAdminApi(1);
  if (errorResponse) return { ok: false, error: "UNAUTHORIZED" };

  const ids = Array.isArray(input.installerIds) ? input.installerIds.filter(Boolean) : [];
  if (ids.length === 0) return { ok: false, error: "NO_RECIPIENTS" };

  const body = String(input.body ?? "").trim();
  if (!body) return { ok: false, error: "BODY_REQUIRED" };
  if (!body.includes("{link}")) return { ok: false, error: "LINK_PLACEHOLDER_REQUIRED" };

  const targets = await prisma.installer.findMany({
    where: { id: { in: ids }, inCurrentRoster: true },
    select: { id: true, name: true, phone: true },
  });
  if (targets.length === 0) return { ok: false, error: "NO_RECIPIENTS" };

  const link = `${getBaseUrl()}${PROFILE_SMS_PATH}`;
  const text = body.replaceAll("{link}", link);

  let sent = 0;
  const failed: Array<{ name: string; phone: string }> = [];

  for (const target of targets) {
    try {
      await sendSms(target.phone, text);
      sent += 1;
    } catch (error) {
      console.error("[installers/profile-sms]", target.phone, error);
      failed.push({ name: target.name, phone: target.phone });
    }
  }

  return { ok: true, sent, failed };
}
