import { requireAdminPage } from "@/lib/adminAuth";
import { getBaseUrl } from "@/lib/getBaseUrl";
import { prisma } from "@/lib/prisma";
import { seminarPublicPath } from "@/lib/seminar/registration";
import { formatSeminarDateTime, resolveSeminarState } from "@/lib/seminar/state";
import BackofficePageHeader from "../BackofficePageHeader";
import SeminarsClient from "./SeminarsClient";

export const dynamic = "force-dynamic";

export default async function BackofficeSeminarsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  // 접수 닫기·신청 취소 액션이 등급 1 을 요구하므로 화면도 같은 등급으로 막는다.
  await requireAdminPage("/backoffice/seminars", 1);

  const seminars = await prisma.seminar.findMany({ orderBy: { createdAt: "desc" } });
  if (seminars.length === 0) {
    return (
      <div className="p-6">
        <BackofficePageHeader title="세미나 신청 현황" />
        <p className="text-sm text-zinc-500">등록된 세미나가 없습니다.</p>
      </div>
    );
  }

  const { id } = await searchParams;
  const seminar = seminars.find((item) => item.id === id) ?? seminars[0];

  const registrations = await prisma.seminarRegistration.findMany({
    where: { seminarId: seminar.id },
    orderBy: { registeredAt: "asc" },
    include: { installer: { select: { name: true, phone: true, branch: true, region: true } } },
  });
  const activeCount = registrations.filter((row) => !row.cancelledAt).length;

  return (
    <SeminarsClient
      seminars={seminars.map((item) => ({ id: item.id, title: item.title, scheduleText: item.scheduleText }))}
      seminar={{
        id: seminar.id,
        title: seminar.title,
        scheduleText: seminar.scheduleText,
        venue: seminar.venue,
        capacity: seminar.capacity,
        closesAt: seminar.closesAt ? formatSeminarDateTime(seminar.closesAt) : null,
        manuallyClosed: seminar.manuallyClosed,
        state: resolveSeminarState(seminar, activeCount, new Date()),
        publicUrl: `${getBaseUrl()}${seminarPublicPath(seminar.slug)}`,
      }}
      registrations={registrations.map((row) => ({
        id: row.id,
        name: row.installer.name,
        phone: row.installer.phone,
        branch: row.installer.branch,
        region: row.installer.region,
        registeredAt: formatSeminarDateTime(row.registeredAt),
        cancelledAt: row.cancelledAt ? formatSeminarDateTime(row.cancelledAt) : null,
        cancelledBy: row.cancelledBy,
      }))}
    />
  );
}
