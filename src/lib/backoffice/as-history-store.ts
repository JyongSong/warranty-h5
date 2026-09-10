import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encryptNullablePii, hmacPii, normalizeNameForHash } from "@/lib/piiCrypto";
import type { AsHistoryImportRow } from "@/lib/backoffice/as-history-import";
import { buildInstallerMatcher } from "@/lib/backoffice/as-history-match";

export type AsHistorySaveResult = {
  saved: number;
  inserted: number;
  updated: number;
  /** 기사 1명까지 확정된 건 */
  matchedInstaller: number;
  /** 업체까지만 확정된 건 */
  matchedVendor: number;
  /** 업체도 못 찾은 건. 원문은 그대로 남는다 */
  unmatched: number;
  /** 050X 안심번호라 전화로는 영영 못 찾는 건 */
  safeNumber: number;
};

// 한 행이 파라미터 18개를 쓴다. Postgres 상한(65535)에 한참 못 미치면서
// 왕복은 충분히 줄이는 크기.
const CHUNK_SIZE = 300;

export async function saveAsInstallHistory(rows: AsHistoryImportRow[]): Promise<AsHistorySaveResult> {
  const result: AsHistorySaveResult = {
    saved: 0,
    inserted: 0,
    updated: 0,
    matchedInstaller: 0,
    matchedVendor: 0,
    unmatched: 0,
    safeNumber: 0,
  };
  if (rows.length === 0) return result;

  const installers = await prisma.installer.findMany({
    select: { id: true, name: true, branch: true, active: true },
  });
  const match = buildInstallerMatcher(installers);

  const prepared = rows.map((row) => {
    const matched = match(row);
    if (matched.matchedBy === "INSTALLER_NAME") result.matchedInstaller += 1;
    else if (matched.matchedBy === "VENDOR_NAME") result.matchedVendor += 1;
    else result.unmatched += 1;
    if (row.phoneKind === "SAFE") result.safeNumber += 1;

    return {
      erpDocNo: row.erpDocNo,
      installDate: row.installDate,
      customerNameEncrypted: encryptNullablePii(row.customerName),
      customerNameHash: row.customerName ? hmacPii(normalizeNameForHash(row.customerName)) : null,
      customerPhoneEncrypted: encryptNullablePii(row.customerPhone),
      // 안심번호도 hash 를 남긴다. 그 번호로 다시 접수되는 경우가 있다.
      customerPhoneHash: row.customerPhone ? hmacPii(row.customerPhone) : null,
      phoneKind: row.phoneKind,
      addressEncrypted: encryptNullablePii(row.address),
      addressHash: row.addressKey ? hmacPii(row.addressKey) : null,
      itemName: row.itemName,
      vendorName: row.vendorName,
      installerNameRaw: row.installerNameRaw,
      matchedInstallerId: matched.installerId,
      matchedBranch: matched.branch,
      matchedBy: matched.matchedBy,
      serviceFee: row.serviceFee,
      erpStatus: row.erpStatus,
      memo: row.memo,
    };
  });

  for (let i = 0; i < prepared.length; i += CHUNK_SIZE) {
    const chunk = prepared.slice(i, i + CHUNK_SIZE);
    const values = chunk.map(
      (r) => Prisma.sql`(
        ${r.erpDocNo}, ${r.installDate}, ${r.customerNameEncrypted}, ${r.customerNameHash},
        ${r.customerPhoneEncrypted}, ${r.customerPhoneHash}, ${r.phoneKind},
        ${r.addressEncrypted}, ${r.addressHash}, ${r.itemName}, ${r.vendorName},
        ${r.installerNameRaw}, ${r.matchedInstallerId}, ${r.matchedBranch}, ${r.matchedBy},
        ${r.serviceFee}, ${r.erpStatus}, ${r.memo}, now()
      )`,
    );

    // xmax = 0 이면 이번에 새로 들어간 행이다. 재업로드 때 "몇 건이 갱신됐나"를
    // 그대로 보여줘야 담당자가 ERP 보정이 반영됐는지 확인할 수 있다.
    const returned = await prisma.$queryRaw<{ inserted: boolean }[]>(Prisma.sql`
      INSERT INTO "as_install_history" (
        "erp_doc_no", "install_date", "customer_name_encrypted", "customer_name_hash",
        "customer_phone_encrypted", "customer_phone_hash", "phone_kind",
        "address_encrypted", "address_hash", "item_name", "vendor_name",
        "installer_name_raw", "matched_installer_id", "matched_branch", "matched_by",
        "service_fee", "erp_status", "memo", "updated_at"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("erp_doc_no") DO UPDATE SET
        "install_date"             = EXCLUDED."install_date",
        "customer_name_encrypted"  = EXCLUDED."customer_name_encrypted",
        "customer_name_hash"       = EXCLUDED."customer_name_hash",
        "customer_phone_encrypted" = EXCLUDED."customer_phone_encrypted",
        "customer_phone_hash"      = EXCLUDED."customer_phone_hash",
        "phone_kind"               = EXCLUDED."phone_kind",
        "address_encrypted"        = EXCLUDED."address_encrypted",
        "address_hash"             = EXCLUDED."address_hash",
        "item_name"                = EXCLUDED."item_name",
        "vendor_name"              = EXCLUDED."vendor_name",
        "installer_name_raw"       = EXCLUDED."installer_name_raw",
        "matched_installer_id"     = EXCLUDED."matched_installer_id",
        "matched_branch"           = EXCLUDED."matched_branch",
        "matched_by"               = EXCLUDED."matched_by",
        "service_fee"              = EXCLUDED."service_fee",
        "erp_status"               = EXCLUDED."erp_status",
        "memo"                     = EXCLUDED."memo",
        "updated_at"               = now()
      RETURNING (xmax = 0) AS "inserted"
    `);

    for (const row of returned) {
      if (row.inserted) result.inserted += 1;
      else result.updated += 1;
    }
    result.saved += chunk.length;
  }

  return result;
}
