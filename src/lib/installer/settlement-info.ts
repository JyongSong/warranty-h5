import { prisma } from "@/lib/prisma";
import { SYSTEM_SETTING_KEYS, isPreviewSettlementOverride, isSystemSettingEnabled } from "@/lib/backoffice/system-settings";
import { decryptNullablePii, encryptPii } from "@/lib/piiCrypto";
import {
  TAX_DOC_TYPES,
  isValidBusinessNumber,
  type SettlementInfoStatus,
  type TaxDocType,
} from "@/lib/installer/settlement-info-shared";
import { findMissingPhotos, getCompletionPhotoSignedUrls, installerDocPrefix } from "@/lib/installer/storage";

/**
 * 기사 정산 정보: 정산 때 받는 증빙 종류 + 사업자·계좌 정보 + 사업자등록증·통장 사진.
 * 기사가 앱에서 제출하고 본사가 승인/반려한다. 다시 제출하면 심사 대기로 돌아간다.
 * 화면(클라이언트)에서도 쓰는 상수·검증은 settlement-info-shared 에 있다.
 */

export * from "@/lib/installer/settlement-info-shared";

export class SettlementInfoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementInfoError";
  }
}

export type SettlementInfoInput = {
  taxDocType: string;
  businessNumber: string;
  businessName: string;
  representativeName: string;
  invoiceEmail: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  businessLicensePhotoPath: string;
  bankbookPhotoPath: string;
};

type ParsedInput = Omit<SettlementInfoInput, "taxDocType" | "invoiceEmail"> & {
  taxDocType: TaxDocType | null;
  invoiceEmail: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param taxDocTypeEnabled 증빙 종류 선택이 켜져 있으면 필수로 받는다. 꺼져 있으면 입력을 무시하고
 *   keepTaxDocType(이전에 저장된 값)을 그대로 둔다 — 숨겼다고 이미 받은 값을 지우지 않는다.
 */
export function parseSettlementInfoInput(
  installerId: string,
  input: SettlementInfoInput,
  options: { taxDocTypeEnabled: boolean; keepTaxDocType?: TaxDocType | null } = { taxDocTypeEnabled: true },
): ParsedInput {
  let taxDocType: TaxDocType | null;
  if (options.taxDocTypeEnabled) {
    taxDocType = input.taxDocType as TaxDocType;
    if (!TAX_DOC_TYPES.includes(taxDocType)) throw new SettlementInfoError("TAX_DOC_TYPE_INVALID");
  } else {
    taxDocType = options.keepTaxDocType ?? null;
  }

  const businessNumber = input.businessNumber.replace(/\D/g, "");
  if (!isValidBusinessNumber(businessNumber)) throw new SettlementInfoError("BUSINESS_NUMBER_INVALID");

  const businessName = input.businessName.trim();
  const representativeName = input.representativeName.trim();
  const bankName = input.bankName.trim();
  const accountHolder = input.accountHolder.trim();
  const accountNumber = input.accountNumber.replace(/[^\d-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!businessName) throw new SettlementInfoError("BUSINESS_NAME_REQUIRED");
  if (!representativeName) throw new SettlementInfoError("REPRESENTATIVE_REQUIRED");
  if (!bankName) throw new SettlementInfoError("BANK_NAME_REQUIRED");
  if (!accountHolder) throw new SettlementInfoError("ACCOUNT_HOLDER_REQUIRED");
  if (accountNumber.replace(/\D/g, "").length < 8) throw new SettlementInfoError("ACCOUNT_NUMBER_INVALID");

  const email = input.invoiceEmail.trim();
  if (email && !EMAIL_RE.test(email)) throw new SettlementInfoError("EMAIL_INVALID");
  // 이메일은 선택이다. 세금계산서(전자·종이)를 한 가지로 합치면서 종이로 발행하는 기사도 고르게 돼 필수에서 뺐다.
  // 앱 발행(팝빌)은 이메일 없이도 된다. 있으면 공급자 이메일로 세금계산서에 들어간다.

  const prefix = installerDocPrefix(installerId);
  for (const path of [input.businessLicensePhotoPath, input.bankbookPhotoPath]) {
    if (!path || !path.startsWith(prefix) || path.includes("..")) throw new SettlementInfoError("PHOTO_REQUIRED");
  }

  return {
    taxDocType,
    businessNumber,
    businessName,
    representativeName,
    invoiceEmail: email || null,
    bankName,
    accountNumber,
    accountHolder,
    businessLicensePhotoPath: input.businessLicensePhotoPath,
    bankbookPhotoPath: input.bankbookPhotoPath,
  };
}

export type SettlementInfoView = {
  taxDocType: TaxDocType | null;
  businessNumber: string;
  businessName: string;
  representativeName: string;
  invoiceEmail: string | null;
  bankName: string;
  /** 복호화 실패 시 null */
  accountNumber: string | null;
  accountHolder: string;
  businessLicensePhotoPath: string;
  bankbookPhotoPath: string;
  businessLicensePhotoUrl: string | null;
  bankbookPhotoUrl: string | null;
  status: SettlementInfoStatus;
  rejectReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
};

function tryDecrypt(value: string): string | null {
  try {
    return decryptNullablePii(value);
  } catch {
    return null;
  }
}

export async function getSettlementInfo(installerId: string): Promise<SettlementInfoView | null> {
  const row = await prisma.installerSettlementInfo.findUnique({ where: { installerId } });
  if (!row) return null;
  const [license, bankbook] = await getCompletionPhotoSignedUrls([row.businessLicensePhotoPath, row.bankbookPhotoPath]);
  return {
    taxDocType: (row.taxDocType as TaxDocType | null) ?? null,
    businessNumber: row.businessNumber,
    businessName: row.businessName,
    representativeName: row.representativeName,
    invoiceEmail: row.invoiceEmail,
    bankName: row.bankName,
    accountNumber: tryDecrypt(row.accountNumberEncrypted),
    accountHolder: row.accountHolder,
    businessLicensePhotoPath: row.businessLicensePhotoPath,
    bankbookPhotoPath: row.bankbookPhotoPath,
    businessLicensePhotoUrl: license?.url ?? null,
    bankbookPhotoUrl: bankbook?.url ?? null,
    status: row.status as SettlementInfoStatus,
    rejectReason: row.rejectReason,
    submittedAt: row.submittedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

/** 기사 제출. 처음이면 만들고, 이미 있으면 덮어쓰고 심사 대기로 되돌린다. */
export async function isTaxDocTypeEnabled(): Promise<boolean> {
  if (isPreviewSettlementOverride()) return true;
  return isSystemSettingEnabled(SYSTEM_SETTING_KEYS.installerTaxDocTypeEnabled);
}

export async function submitSettlementInfo(installerId: string, input: SettlementInfoInput): Promise<void> {
  const taxDocTypeEnabled = await isTaxDocTypeEnabled();
  const existing = taxDocTypeEnabled
    ? null
    : await prisma.installerSettlementInfo.findUnique({ where: { installerId }, select: { taxDocType: true } });
  const parsed = parseSettlementInfoInput(installerId, input, {
    taxDocTypeEnabled,
    keepTaxDocType: (existing?.taxDocType as TaxDocType | null | undefined) ?? null,
  });
  const missing = await findMissingPhotos([parsed.businessLicensePhotoPath, parsed.bankbookPhotoPath]);
  if (missing.length > 0) throw new SettlementInfoError("PHOTO_MISSING");

  const { accountNumber, ...rest } = parsed;
  const data = {
    ...rest,
    accountNumberEncrypted: encryptPii(accountNumber),
    status: "SUBMITTED",
    rejectReason: null,
    submittedAt: new Date(),
    reviewedAt: null,
    reviewedByAdminId: null,
  };
  await prisma.installerSettlementInfo.upsert({
    where: { installerId },
    create: { installerId, ...data },
    update: data,
  });
}

/** 본사 승인/반려. 반려는 사유가 있어야 한다(기사 앱에 그대로 보인다). */
export async function reviewSettlementInfo(input: {
  installerId: string;
  adminId: string;
  approve: boolean;
  rejectReason?: string;
}): Promise<void> {
  const row = await prisma.installerSettlementInfo.findUnique({
    where: { installerId: input.installerId },
    select: { id: true },
  });
  if (!row) throw new SettlementInfoError("NOT_FOUND");
  const reason = input.rejectReason?.trim() ?? "";
  if (!input.approve && !reason) throw new SettlementInfoError("REJECT_REASON_REQUIRED");
  await prisma.installerSettlementInfo.update({
    where: { id: row.id },
    data: {
      status: input.approve ? "APPROVED" : "REJECTED",
      rejectReason: input.approve ? null : reason,
      reviewedAt: new Date(),
      reviewedByAdminId: input.adminId,
    },
  });
}
