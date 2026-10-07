// 세미나 접수 상태 판정과 화면 표기. DB 를 건드리지 않는 순수 함수만 둔다.

export type SeminarState = "OPEN" | "FULL" | "CLOSED";

export type SeminarWindow = {
  capacity: number;
  closesAt: Date | null;
  manuallyClosed: boolean;
};

/** 마감 시각이 지났는지. 지나면 신청도 취소도 받지 않는다. */
export function isPastSeminarDeadline(seminar: Pick<SeminarWindow, "closesAt">, now: Date): boolean {
  return seminar.closesAt !== null && now.getTime() >= seminar.closesAt.getTime();
}

/**
 * 지금 새 신청을 받을 수 있는지.
 * 닫힘(수동·마감 시각)이 정원보다 먼저다 — 자리가 남아도 닫혔으면 CLOSED 다.
 */
export function resolveSeminarState(seminar: SeminarWindow, activeCount: number, now: Date): SeminarState {
  if (seminar.manuallyClosed || isPastSeminarDeadline(seminar, now)) return "CLOSED";
  if (activeCount >= seminar.capacity) return "FULL";
  return "OPEN";
}

/**
 * 공개 화면에 보여 줄 이름. 번호만 알면 누구나 조회할 수 있는 화면이라
 * 본인이 알아볼 만큼만 남기고 가린다. 예: 김철수 → 김*수, 김철 → 김*, 남궁민수 → 남**수
 */
export function maskInstallerName(name: string): string {
  const chars = Array.from((name ?? "").trim());
  if (chars.length <= 1) return chars.join("");
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${"*".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

/**
 * 문의 전화. 담당자가 여럿이면 contact_name / contact_phone 에 쉼표로 나란히 적는다.
 * 예: "김시열, 김동수" / "01099614937, 01022452222" — 같은 순서끼리 짝을 짓는다.
 */
export function parseSeminarContacts(
  names: string | null,
  phones: string | null,
): Array<{ name: string; phone: string }> {
  const nameList = (names ?? "").split(",").map((name) => name.trim());
  return (phones ?? "")
    .split(",")
    .map((phone, index) => ({ name: nameList[index] ?? "", phone: phone.replace(/\D/g, "") }))
    .filter((contact) => contact.phone);
}

const KST_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 서버 시간대와 무관하게 한국 시각으로 적는다. 예: 2026-10-16 16:00 */
export function formatSeminarDateTime(value: Date): string {
  const parts = Object.fromEntries(KST_FORMATTER.formatToParts(value).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function buildSeminarConfirmationSms(input: {
  installerName: string;
  title: string;
  scheduleText: string;
  venue: string;
  link: string;
}): string {
  return [
    `[${input.title}]`,
    `${input.installerName} 기사님, 참석 신청이 완료되었습니다.`,
    "",
    `■ 일시: ${input.scheduleText}`,
    `■ 장소: ${input.venue}`,
    "",
    "참석이 어려우신 경우 아래 링크에서 취소해 주세요.",
    input.link,
  ].join("\n");
}
