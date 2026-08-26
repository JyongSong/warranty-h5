import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { getErrorMessage } from "@/lib/error";
import { normalizePhone, formatKrPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

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

function installTypeLabel(type: string) {
  if (type === "self") return "자가 설치";
  if (type === "external") return "외부 기사";
  return "기사 설치";
}

function statusLabel(status: string) {
  if (status === "confirmed") return "확인 완료";
  if (status === "submitted") return "확인 대기";
  if (status === "void") return "무효";
  return status;
}

function surveyStatusLabel(status: string) {
  switch (status) {
    case "COMPLETED":
      return "발송 및 참여 완료";
    case "SENT":
      return "발송 완료 (미참여)";
    case "READY":
      return "발송 대기";
    case "WAITING":
      return "7영업일 대기 중";
    default:
      return "대상 아님";
  }
}

function formatDateTime(value: Date | string | null) {
  if (!value) return "-";
  let str = "";
  if (value instanceof Date) {
    str = value.toISOString();
  } else {
    str = value;
  }
  return str.replace("T", " ").slice(0, 16);
}

export async function GET(req: NextRequest) {
  try {
    const { errorResponse } = await requireAdminApi(1);
    if (errorResponse) return errorResponse;

    const sp = new URL(req.url).searchParams;
    const query = String(sp.get("query") ?? "").trim();
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

    // Generate Excel using XLSX
    const wb = XLSX.utils.book_new();
    const wsData = [
      [
        "시리얼 번호 (SN)",
        "설치 유형",
        "설치일",
        "고객 전화번호",
        "담당 설치 기사",
        "기사 전화번호",
        "소속 지사",
        "상태",
        "무상 A/S 종료일",
        "접수 시각",
        "확인 완료 시각",
        "확인 주체",
        "만족도 조사 상태",
        "1-1) 설치 기사님은 약속된 시간에 맞춰 방문해 주셨나요?",
        "1-2) 도어락 설치가 꼼꼼하고 깔끔하게 완료되었다고 느끼셨나요?",
        "1-3) 기사님께서 제품 사용 방법 및 안전 주의사항을 친절하게 안내해 주셨나요?",
        "2-1) 도어락과 앱을 설치하고 연결하는 과정은 편리하셨나요?",
        "2-2) 앱 회원가입 및 기기(도어락) 등록 과정은 큰 어려움 없이 원활하게 진행되었나요?",
        "2-3) 현재 앱 사용 환경 및 기능 제공은 전반적으로 만족스러우신가요?",
        "3-1) 아카라 도어락의 전반적인 사용 만족도 (5점 만점)",
        "기타 의견"
      ]
    ];

    items.forEach((item) => {
      wsData.push([
        item.sn,
        installTypeLabel(item.installType),
        item.installDate,
        formatKrPhone(item.userPhone),
        item.installerName ?? "-",
        item.installerPhone ? formatKrPhone(item.installerPhone) : "-",
        item.installerBranch ?? "-",
        statusLabel(item.status),
        item.freeAsEndDate ?? "-",
        formatDateTime(item.submittedAt),
        formatDateTime(item.confirmedAt),
        item.confirmedBy ?? "-",
        surveyStatusLabel(item.surveyStatus),
        item.survey?.q1_1 ?? "-",
        item.survey?.q1_2 ?? "-",
        item.survey?.q1_3 ?? "-",
        item.survey?.q2_1 ?? "-",
        item.survey?.q2_2 ?? "-",
        item.survey?.q2_3 ?? "-",
        item.survey?.q3_1 ? `${item.survey.q3_1}점` : "-",
        item.survey?.comment ?? "-"
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 20 }, // SN
      { wch: 10 }, // 설치 유형
      { wch: 12 }, // 설치일
      { wch: 15 }, // 고객 전화번호
      { wch: 12 }, // 담당 설치 기사
      { wch: 15 }, // 기사 전화번호
      { wch: 12 }, // 소속 지사
      { wch: 10 }, // 상태
      { wch: 14 }, // 무상 A/S 종료일
      { wch: 18 }, // 접수 시각
      { wch: 18 }, // 확인 완료 시각
      { wch: 12 }, // 확인 주체
      { wch: 18 }, // 만족도 조사 상태
      { wch: 16 }, // 1-1
      { wch: 16 }, // 1-2
      { wch: 16 }, // 1-3
      { wch: 16 }, // 2-1
      { wch: 16 }, // 2-2
      { wch: 16 }, // 2-3
      { wch: 16 }, // 3-1
      { wch: 40 }, // 기타 의견
    ];
    XLSX.utils.book_append_sheet(wb, ws, "설치 및 만족도 내역");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `설치_및_만족도_내역_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, "Excel 생성 실패") },
      { status: 500 }
    );
  }
}
