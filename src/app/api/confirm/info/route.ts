import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("t")?.trim();

    if (!token) {
        return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 400 });
    }

    const data = await prisma.warrantyRegistration.findFirst({
        where: { confirmToken: token },
        select: {
            id: true,
            sn: true,
            installDate: true,
            userPhone: true,
            installerPhone: true,
            status: true,
            confirmTokenExpiresAt: true,
            submittedAt: true,
        },
    });

    if (!data) {
        return NextResponse.json({ error: "TOKEN_NOT_FOUND" }, { status: 404 });
    }

    const tokenExpired =
        data.confirmTokenExpiresAt && data.confirmTokenExpiresAt.getTime() < Date.now();

    return NextResponse.json({
        id: data.id,
        sn: data.sn,
        installDate: data.installDate,
        userPhone: data.userPhone,
        installerPhone: data.installerPhone,
        status: data.status,
        tokenExpired,
        createdAt: data.submittedAt,
    });
}
