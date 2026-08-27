"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  PARTNER_COOKIE_NAME,
  createPartnerSessionToken,
  requirePartner,
  verifyPartnerPassword,
} from "@/lib/partnerAuth";
import { CjManifestError, saveCjManifestUpload } from "@/lib/installation/cj/manifest";

export type PartnerLoginResult = { ok: false; message: string } | never;

export async function partnerLoginAction(formData: FormData): Promise<PartnerLoginResult> {
  const loginId = String(formData.get("loginId") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!loginId || !password) {
    return { ok: false, message: "아이디와 비밀번호를 입력해 주세요." };
  }

  const partner = await prisma.partnerAccount.findUnique({
    where: { loginId },
    select: { id: true, passwordHash: true, active: true },
  });

  // 존재하지 않는 아이디와 틀린 비밀번호를 같은 문구로 돌려준다(계정 탐색 방지).
  if (!partner?.active || !verifyPartnerPassword(password, partner.passwordHash)) {
    return { ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }

  await prisma.partnerAccount.update({
    where: { id: partner.id },
    data: { lastLoginAt: new Date() },
  });

  const store = await cookies();
  store.set(PARTNER_COOKIE_NAME, createPartnerSessionToken({ partnerId: partner.id, issuedAt: Date.now() }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/partner",
    maxAge: 12 * 60 * 60,
  });

  redirect("/partner/cj");
}

export async function partnerLogoutAction() {
  const store = await cookies();
  store.delete(PARTNER_COOKIE_NAME);
  redirect("/partner/login");
}

export type UploadManifestResult =
  | { ok: true; totalRows: number; insertedCount: number; duplicateCount: number; invalidCount: number }
  | { ok: false; message: string };

export async function uploadCjManifestAction(formData: FormData): Promise<UploadManifestResult> {
  const partner = await requirePartner();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "업로드할 파일을 선택해 주세요." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, message: "파일 크기는 5MB 이하만 업로드할 수 있습니다." };
  }

  try {
    const text = await file.text();
    const result = await saveCjManifestUpload({
      fileName: file.name,
      text,
      uploadedBy: partner.name,
    });

    return {
      ok: true,
      totalRows: result.totalRows,
      insertedCount: result.insertedCount,
      duplicateCount: result.duplicateCount,
      invalidCount: result.invalidCount,
    };
  } catch (error) {
    if (error instanceof CjManifestError && error.message === "EMPTY_FILE") {
      return { ok: false, message: "파일에서 주문번호를 찾지 못했습니다. 첫 번째 열에 주문번호가 있는지 확인해 주세요." };
    }

    console.error("[partner/upload]", error);
    return { ok: false, message: "업로드에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }
}
