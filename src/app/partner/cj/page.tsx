import { requirePartnerWithCode } from "@/lib/partnerAuth";
import {
  getCjManifestStats,
  listRecentCjManifestUploads,
  searchCjManifestEntries,
} from "@/lib/installation/cj/manifest";
import CjUploadClient from "./CjUploadClient";

export const dynamic = "force-dynamic";

export default async function PartnerCjUploadPage() {
  const partner = await requirePartnerWithCode("CJ");
  const [uploads, stats, recent] = await Promise.all([
    listRecentCjManifestUploads(),
    getCjManifestStats(),
    searchCjManifestEntries(""),
  ]);

  return (
    <CjUploadClient
      partnerName={partner.name}
      stats={stats}
      recentTruncated={recent.truncated}
      recentEntries={recent.entries.map((entry) => ({
        id: entry.id,
        orderNo: entry.orderNo,
        orderDate: entry.orderDate,
        createdAt: entry.createdAt.toISOString(),
        consumedAt: entry.consumedAt?.toISOString() ?? null,
      }))}
      uploads={uploads.map((upload) => ({
        id: upload.id,
        fileName: upload.fileName,
        totalRows: upload.totalRows,
        insertedCount: upload.insertedCount,
        duplicateCount: upload.duplicateCount,
        invalidCount: upload.invalidCount,
        uploadedBy: upload.uploadedBy,
        createdAt: upload.createdAt.toISOString(),
      }))}
    />
  );
}
