import { requirePartner } from "@/lib/partnerAuth";
import {
  getCjManifestStats,
  listRecentCjManifestUploads,
} from "@/lib/installation/cj/manifest";
import CjUploadClient from "./CjUploadClient";

export const dynamic = "force-dynamic";

export default async function PartnerCjUploadPage() {
  const partner = await requirePartner();
  const [uploads, stats] = await Promise.all([
    listRecentCjManifestUploads(),
    getCjManifestStats(),
  ]);

  return (
    <CjUploadClient
      partnerName={partner.name}
      stats={stats}
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
