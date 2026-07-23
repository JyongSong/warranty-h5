import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { getErrorMessage } from "@/lib/error";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";

const KOREAN_HOLIDAYS_2026 = [
  "2026-01-01", // 신정
  "2026-02-16", "2026-02-17", "2026-02-18", // 설날 연휴
  "2026-03-01", "2026-03-02", // 삼일절 및 대체공휴일
  "2026-05-05", // 어린이날
  "2026-05-24", "2026-05-25", // 부처님오신날 및 대체공휴일
  "2026-06-06", // 현충일
  "2026-08-15", "2026-08-17", // 광복절 및 대체공휴일
  "2026-09-24", "2026-09-25", "2026-09-26", // 추석 연휴
  "2026-10-03", // 개천절
  "2026-10-09", // 한글날
  "2026-12-25"  // 기독탄신일(크리스마스)
];

function isWeekendOrHoliday(date: Date): boolean {
  const kstWeekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
  }).format(date);

  if (kstWeekday === "Sat" || kstWeekday === "Sun") return true;

  const kstDateStr = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
  }).format(date);

  return KOREAN_HOLIDAYS_2026.includes(kstDateStr);
}

function hasPassedBusinessDays(confirmedAt: Date, targetBusinessDays: number): boolean {
  const start = new Date(confirmedAt);
  start.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (start >= today) return false;

  let businessDays = 0;
  const current = new Date(start);

  while (current < today) {
    current.setDate(current.getDate() + 1);
    if (!isWeekendOrHoliday(current)) {
      businessDays++;
    }
  }

  return businessDays >= targetBusinessDays;
}

export async function GET(req: Request) {
  try {
    const { errorResponse } = await requireAdminApi(1);
    if (errorResponse) return errorResponse;

    const { searchParams } = new URL(req.url);
    const query = String(searchParams.get("query") ?? "").trim();
    const normalizedPhone = normalizePhone(query);

    const where =
      query.length >= 2 || normalizedPhone.length >= 2
        ? {
            OR: [
              { sn: { contains: query, mode: "insensitive" as const } },
              { userPhone: { contains: normalizedPhone || query } },
              { installerPhone: { contains: normalizedPhone || query } },
              { status: { contains: query, mode: "insensitive" as const } },
              { installType: { contains: query, mode: "insensitive" as const } },
              { confirmedBy: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : undefined;

    const rows = await prisma.warrantyRegistration.findMany({
      where,
      include: {
        survey: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    const installerPhones = Array.from(new Set(
      rows.map((r) => r.installerPhone).filter((phone): phone is string => !!phone)
    ));

    const installers = installerPhones.length > 0
      ? await prisma.installer.findMany({
          where: { phone: { in: installerPhones } },
          select: { phone: true, name: true, branch: true },
        })
      : [];

    const installerMap = new Map<string, { name: string; branch: string | null }>();
    for (const inst of installers) {
      installerMap.set(inst.phone, { name: inst.name, branch: inst.branch });
    }

    const items = rows.map((row) => {
      let surveyStatus = "NONE";

      if (row.installType === "installer" && row.status === "confirmed") {
        if (row.surveySentAt) {
          surveyStatus = row.survey ? "COMPLETED" : "SENT";
        } else if (row.confirmedAt) {
          const reached = hasPassedBusinessDays(row.confirmedAt, 7);
          surveyStatus = reached ? "READY" : "WAITING";
        }
      }

      const instInfo = row.installerPhone ? installerMap.get(row.installerPhone) : null;

      return {
        ...row,
        surveyStatus,
        installerName: instInfo?.name || null,
        installerBranch: instInfo?.branch || null,
      };
    });

    return NextResponse.json({ items });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "UNKNOWN_ERROR") },
      { status: 500 }
    );
  }
}
