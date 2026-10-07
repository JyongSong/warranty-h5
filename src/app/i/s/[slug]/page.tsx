import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { countActiveSeminarRegistrations, getSeminarBySlug } from "@/lib/seminar/registration";
import { resolveSeminarState } from "@/lib/seminar/state";
import SeminarClient from "./SeminarClient";

// 문자로 받은 링크의 도착지. 로그인 없이 열리고, 휴대폰 번호로 초대 대상인지만 확인한다.

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const seminar = await getSeminarBySlug(slug);
  return { title: seminar ? `${seminar.title} 참석 신청` : "세미나 참석 신청" };
}

export default async function SeminarPage({ params }: PageProps) {
  const { slug } = await params;
  const seminar = await getSeminarBySlug(slug);
  if (!seminar) notFound();

  const activeCount = await countActiveSeminarRegistrations(seminar.id);

  // 정원(capacity)과 남은 자리 수는 화면으로 내려보내지 않는다. 열림/닫힘만 알린다.
  return (
    <SeminarClient
      slug={seminar.slug}
      open={resolveSeminarState(seminar, activeCount, new Date()) === "OPEN"}
      seminar={{
        title: seminar.title,
        description: seminar.description,
        scheduleText: seminar.scheduleText,
        venue: seminar.venue,
        venueNote: seminar.venueNote,
        attendanceNote: seminar.attendanceNote,
        programItems: seminar.programItems,
        parkingInfo: seminar.parkingInfo,
        contactName: seminar.contactName,
        contactPhone: seminar.contactPhone,
      }}
    />
  );
}
