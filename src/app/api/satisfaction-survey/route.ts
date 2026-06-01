import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { registrationId, q1_1, q1_2, q1_3, q2_1, q2_2, q2_3, q3_1, comment } = body;

    if (!registrationId) {
      return NextResponse.json({ error: "등록 ID가 필요합니다." }, { status: 400 });
    }

    // Validate fields
    if (!q1_1 || !q1_2 || !q1_3 || !q2_1 || !q2_2 || !q2_3 || q3_1 == null) {
      return NextResponse.json({ error: "모든 필수 설문 항목을 입력해 주세요." }, { status: 400 });
    }

    const registration = await prisma.warrantyRegistration.findUnique({
      where: { id: registrationId },
    });

    if (!registration) {
      return NextResponse.json({ error: "존재하지 않는 등록 내역입니다." }, { status: 404 });
    }

    // Check if already submitted
    const existing = await prisma.satisfactionSurvey.findUnique({
      where: { registrationId },
    });

    if (existing) {
      return NextResponse.json({ error: "이미 제출된 설문조사입니다." }, { status: 400 });
    }

    // Save survey response
    await prisma.satisfactionSurvey.create({
      data: {
        registrationId,
        q1_1,
        q1_2,
        q1_3,
        q2_1,
        q2_2,
        q2_3,
        q3_1: Number(q3_1),
        comment: comment || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "설문이 성공적으로 등록되었습니다. 참여해 주셔서 감사합니다.",
    });
  } catch (error: unknown) {
    console.error("[Submit Survey API] Error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
