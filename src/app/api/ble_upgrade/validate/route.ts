import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getErrorMessage } from "@/lib/error";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const sn = String(body?.sn ?? "").trim().toUpperCase();
    const contact = String(body?.contact ?? "").trim();

    if (!sn) {
      return NextResponse.json(
        { message: "기기 SN을 입력해 주세요." },
        { status: 400 }
      );
    }

    // 1. 出货设备表校验 (ShippedDevice)
    const shipped = await prisma.shippedDevice.findUnique({
      where: { sn },
    });

    if (!shipped) {
      return NextResponse.json(
        { message: "일치하는 출고 기기 정보가 없습니다. SN을 확인해 주세요." },
        { status: 400 }
      );
    }

    // 2. 限制仅支持 L100 系列设备升级 (L100, L100 SE 等)
    const modelName = shipped.model || "";
    if (!modelName.toUpperCase().startsWith("L100")) {
      return NextResponse.json(
        { message: `해당 기기(${modelName})는 업그레이드 대상 모델이 아닙니다. (L100 SE 전用)` },
        { status: 400 }
      );
    }

    // 3. 校验已付款/已激活状态 (device_feature_upgrades)
    const upgrade = await prisma.device_feature_upgrades.findUnique({
      where: { sn },
    });

    if (upgrade && upgrade.purchase_status === "paid") {
      return NextResponse.json(
        { message: "이미 Zigbee 업그레이드가 완료된 기기입니다." },
        { status: 400 }
      );
    }

    // 返回成功验证信息
    return NextResponse.json({
      success: true,
      message: "업그레이드가 가능한 기기입니다.",
      device: {
        sn: shipped.sn,
        model: shipped.model || "L100 SE",
        purchaseStatus: upgrade ? upgrade.purchase_status : "unpaid",
      },
    });
  } catch (error: unknown) {
    console.error("SN validation error:", error);
    return NextResponse.json(
      { message: getErrorMessage(error, "기기 검증 중 오류가 발생했습니다.") },
      { status: 500 }
    );
  }
}
