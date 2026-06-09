import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID가 필요합니다." }, { status: 400 });
    }

    const registration = await prisma.warrantyRegistration.findUnique({
      where: { id },
      include: {
        survey: true,
      },
    });

    if (!registration) {
      return NextResponse.json({ error: "존재하지 않는 등록 내역입니다." }, { status: 404 });
    }

    if (registration.survey) {
      return NextResponse.json({ alreadySubmitted: true });
    }

    // Find model from ShippedDevice
    const shipped = await prisma.shippedDevice.findUnique({
      where: { sn: registration.sn },
      select: { model: true },
    });

    const model = shipped?.model || (registration.sn.startsWith("AKS") ? "K100" : "L100");

    // Mask phone number for privacy
    const cleanPhone = registration.userPhone.replace(/[^0-9]/g, "");
    let maskedPhone = registration.userPhone;
    if (cleanPhone.length === 11) {
      maskedPhone = `${cleanPhone.slice(0, 3)}-****-${cleanPhone.slice(7)}`;
    } else if (cleanPhone.length === 10) {
      maskedPhone = `${cleanPhone.slice(0, 3)}-***-${cleanPhone.slice(6)}`;
    }

    return NextResponse.json({
      alreadySubmitted: false,
      model,
      installDate: registration.installDate,
      userPhone: maskedPhone,
    });
  } catch (error: unknown) {
    console.error("[Survey Info API] Error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
