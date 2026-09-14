import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { getErrorMessage } from "@/lib/error";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { hasPassedKstBusinessDays } from "@/lib/survey/business-days";
import { SURVEY_SEND_BUSINESS_DAYS } from "@/lib/survey/send";

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
          const reached = hasPassedKstBusinessDays(row.confirmedAt, SURVEY_SEND_BUSINESS_DAYS);
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
