import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import {
  buildJsonEntityDisplay,
  getDataImportColumnMapEntity,
} from "@/lib/backoffice/json-entities";
import BackofficePageHeader from "../../../BackofficePageHeader";
import DataImportForm from "../DataImportForm";

export const dynamic = "force-dynamic";

export default async function BackofficeInstallerDataImportPage() {
  await requireBackofficeUserPage("/backoffice/settings/data-import/installers", 1);
  const columnMapEntity = getDataImportColumnMapEntity();

  return (
    <div className="min-h-screen bg-white px-6 py-7 lg:px-8">
      <BackofficePageHeader title="설치 기사 가져오기" />
      <DataImportForm
        kind="installers"
        columnMapEntity={{
          label: columnMapEntity.label,
          description: columnMapEntity.description,
          filePath: columnMapEntity.filePath,
          display: buildJsonEntityDisplay(columnMapEntity.value),
          rawJson: JSON.stringify(columnMapEntity.value, null, 2),
        }}
      />
    </div>
  );
}
