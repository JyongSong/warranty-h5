import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/error";
import { registerByCjLink } from "@/lib/registration/cjRegister";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await registerByCjLink({
      token: String(body.token ?? ""),
      sn: String(body.sn ?? ""),
      installDate: String(body.installDate ?? ""),
      consentPrivacy: body.consentPrivacy === true,
      consentMarketing: body.consentMarketing === true,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    return NextResponse.json({
      ok: true,
      id: result.id,
      status: "confirmed",
      installType: "installer",
      freeAsEndDate: result.freeAsEndDate,
      installerPhone: result.installerPhone,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error, "UNKNOWN_ERROR") }, { status: 500 });
  }
}
