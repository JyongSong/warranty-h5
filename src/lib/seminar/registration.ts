import { getBaseUrl } from "@/lib/getBaseUrl";
import { isKoreanMobileNumber, normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import {
  buildSeminarConfirmationSms,
  isPastSeminarDeadline,
  maskInstallerName,
  resolveSeminarState,
  type SeminarState,
} from "./state";

// 기사 세미나 참석 신청.
//
// 본인 확인은 휴대폰 번호 하나뿐이다(인증번호 없음). 선착순이라 절차를 줄이는 쪽을
// 택했고, 그 대신 공개 화면에는 가린 이름과 지역만 내보낸다. 남의 번호로 신청·취소한
// 건은 백오피스 명단에서 사람이 바로잡는다.

export class SeminarRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeminarRegistrationError";
  }
}

export function seminarPublicPath(slug: string) {
  return `/i/s/${slug}`;
}

export async function getSeminarBySlug(slug: string) {
  const normalized = String(slug ?? "").trim();
  if (!normalized) return null;
  return prisma.seminar.findUnique({ where: { slug: normalized } });
}

export async function countActiveSeminarRegistrations(seminarId: string) {
  return prisma.seminarRegistration.count({ where: { seminarId, cancelledAt: null } });
}

/** 초대 대상은 이번 명단(in_current_roster)뿐이다. 명단 밖 번호는 없는 번호로 취급한다. */
async function findInvitedInstaller(rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  if (!isKoreanMobileNumber(phone)) throw new SeminarRegistrationError("INVALID_PHONE");

  const installer = await prisma.installer.findUnique({
    where: { phone },
    select: { id: true, name: true, phone: true, region: true, inCurrentRoster: true },
  });
  if (!installer || !installer.inCurrentRoster) throw new SeminarRegistrationError("INSTALLER_NOT_FOUND");
  return installer;
}

async function requireSeminar(slug: string) {
  const seminar = await getSeminarBySlug(slug);
  if (!seminar) throw new SeminarRegistrationError("SEMINAR_NOT_FOUND");
  return seminar;
}

export type SeminarLookup = {
  maskedName: string;
  region: string | null;
  registered: boolean;
  state: SeminarState;
  canCancel: boolean;
};

export async function lookupSeminarRegistration(slug: string, rawPhone: string): Promise<SeminarLookup> {
  const seminar = await requireSeminar(slug);
  const installer = await findInvitedInstaller(rawPhone);

  const [registration, activeCount] = await Promise.all([
    prisma.seminarRegistration.findUnique({
      where: { seminarId_installerId: { seminarId: seminar.id, installerId: installer.id } },
      select: { cancelledAt: true },
    }),
    countActiveSeminarRegistrations(seminar.id),
  ]);

  const now = new Date();
  return {
    maskedName: maskInstallerName(installer.name),
    region: installer.region,
    registered: Boolean(registration && !registration.cancelledAt),
    state: resolveSeminarState(seminar, activeCount, now),
    canCancel: !isPastSeminarDeadline(seminar, now),
  };
}

/**
 * 참석 신청. 이미 신청한 사람이 다시 누르면 그대로 성공으로 돌려준다.
 *
 * 정원 확인과 등록을 한 트랜잭션에서 하고, 먼저 세미나 행을 FOR UPDATE 로 잠근다.
 * 안내 문자가 한꺼번에 나가 동시에 몰려도 신청이 한 줄로 서게 되어 정원을 넘지 않는다.
 * 잠금과 집계를 한 문장으로 합치면 안 된다 — READ COMMITTED 에서는 문장이 시작될 때의
 * 스냅샷으로 세기 때문에, 잠금을 기다리는 동안 들어온 신청이 집계에서 빠진다.
 */
export async function registerForSeminar(
  slug: string,
  rawPhone: string,
): Promise<{ alreadyRegistered: boolean }> {
  const seminar = await requireSeminar(slug);
  const installer = await findInvitedInstaller(rawPhone);

  const outcome = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "seminars" WHERE "id" = ${seminar.id} FOR UPDATE`;

      const existing = await tx.seminarRegistration.findUnique({
        where: { seminarId_installerId: { seminarId: seminar.id, installerId: installer.id } },
        select: { id: true, cancelledAt: true },
      });
      if (existing && !existing.cancelledAt) return "ALREADY" as const;

      // 닫혔는지는 잠근 뒤에 다시 읽는다. 기다리는 사이 관리자가 닫았을 수 있다.
      const current = await tx.seminar.findUniqueOrThrow({
        where: { id: seminar.id },
        select: { capacity: true, closesAt: true, manuallyClosed: true },
      });
      const activeCount = await tx.seminarRegistration.count({
        where: { seminarId: seminar.id, cancelledAt: null },
      });
      const state = resolveSeminarState(current, activeCount, new Date());
      if (state !== "OPEN") return state;

      if (existing) {
        await tx.seminarRegistration.update({
          where: { id: existing.id },
          data: { registeredAt: new Date(), cancelledAt: null, cancelledBy: null },
        });
      } else {
        await tx.seminarRegistration.create({
          data: { seminarId: seminar.id, installerId: installer.id },
        });
      }
      return "REGISTERED" as const;
    },
    { maxWait: 10_000, timeout: 10_000 },
  );

  if (outcome === "FULL" || outcome === "CLOSED") throw new SeminarRegistrationError(`SEMINAR_${outcome}`);
  if (outcome === "ALREADY") return { alreadyRegistered: true };

  // sendSms 는 실패를 삼킨다. 문자가 안 나가도 신청 자체는 이미 끝났다.
  await sendSms(
    installer.phone,
    buildSeminarConfirmationSms({
      installerName: installer.name,
      title: seminar.title,
      scheduleText: seminar.scheduleText,
      venue: seminar.venue,
      link: `${getBaseUrl()}${seminarPublicPath(seminar.slug)}`,
    }),
    seminar.title,
  );

  return { alreadyRegistered: false };
}

/** 본인 취소. 마감 시각 전까지만 받고, 빈 자리는 다음 사람에게 다시 열린다. */
export async function cancelSeminarRegistration(slug: string, rawPhone: string): Promise<void> {
  const seminar = await requireSeminar(slug);
  const installer = await findInvitedInstaller(rawPhone);

  if (isPastSeminarDeadline(seminar, new Date())) throw new SeminarRegistrationError("CANCEL_CLOSED");

  const { count } = await prisma.seminarRegistration.updateMany({
    where: { seminarId: seminar.id, installerId: installer.id, cancelledAt: null },
    data: { cancelledAt: new Date(), cancelledBy: "SELF" },
  });
  if (count === 0) throw new SeminarRegistrationError("NOT_REGISTERED");
}
