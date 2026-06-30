import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Helper: Normalize SN
function normalizeSn(value: string | undefined | null) {
  return String(value || "").trim().toUpperCase();
}

// Helper: Authorization
function isAuthorized(req: Request) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const thirdPartyKey = process.env.THIRD_PARTY_API_KEY?.trim() || "";
  const internalKey = process.env.INTERNAL_API_KEY?.trim() || "";
  
  if (!token) return false;
  return (thirdPartyKey && token === thirdPartyKey) || (internalKey && token === internalKey);
}

// Helper: Get Merged Device Response
async function getMergedDevice(sn: string) {
  const shipped = await prisma.shippedDevice.findUnique({
    where: { sn },
  });

  if (!shipped) {
    return null;
  }

  const upgrade = await prisma.device_feature_upgrades.findUnique({
    where: { sn },
  });

  return {
    sn: shipped.sn,
    purchaseStatus: upgrade?.purchase_status || "pending",
    featureCode: upgrade?.feature_code || "zigbee",
    paidAt: upgrade?.paid_at ? upgrade.paid_at.toISOString() : null,
    lastHubBoundAt: upgrade?.last_hub_bound_at ? upgrade.last_hub_bound_at.toISOString() : null,
    updatedAt: upgrade?.updated_at ? upgrade.updated_at.toISOString() : null,
  };
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sn = normalizeSn(searchParams.get("sn"));

  if (!sn) {
    return NextResponse.json({ message: "Missing required query parameter: sn." }, { status: 400 });
  }

  try {
    const device = await getMergedDevice(sn);
    if (!device) {
      return NextResponse.json({ message: "Device not found." }, { status: 404 });
    }
    return NextResponse.json(device, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const sn = normalizeSn(body.sn);
    
    if (!sn) {
      return NextResponse.json({ message: "Missing required field: sn." }, { status: 400 });
    }

    let lastHubBoundAt: Date | null = null;
    const rawTimestamp = body.lastHubBoundAt;
    
    if (rawTimestamp !== null && rawTimestamp !== "" && typeof rawTimestamp !== "undefined") {
      const parsedDate = new Date(rawTimestamp);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json({ message: "Invalid lastHubBoundAt. Use ISO 8601 format or null." }, { status: 400 });
      }
      lastHubBoundAt = parsedDate;
    }

    const shipped = await prisma.shippedDevice.findUnique({
      where: { sn },
    });

    if (!shipped) {
      return NextResponse.json({ message: "Device not found." }, { status: 404 });
    }

    await prisma.device_feature_upgrades.upsert({
      where: { sn },
      update: {
        last_hub_bound_at: lastHubBoundAt,
      },
      create: {
        sn,
        contact: "Unknown",
        purchase_status: "pending",
        feature_code: "zigbee",
        payment_provider: "none",
        last_hub_bound_at: lastHubBoundAt,
      },
    });

    const updatedDevice = await getMergedDevice(sn);
    return NextResponse.json(updatedDevice, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  return POST(req);
}
