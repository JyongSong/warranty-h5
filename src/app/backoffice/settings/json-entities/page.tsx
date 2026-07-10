import {
  buildJsonEntityDisplay,
  getBackofficeJsonEntities,
} from "@/lib/backoffice/json-entities";
import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import BackofficePageHeader from "../../BackofficePageHeader";
import JsonEntityBrowser from "./JsonEntityBrowser";

export default async function JsonEntitiesPage() {
  await requireBackofficeUserPage("/backoffice/settings/json-entities", 1);
  const entities = getBackofficeJsonEntities().map(({ value, ...entity }) => ({
    ...entity,
    display: buildJsonEntityDisplay(value),
  }));

  return (
    <div className="min-h-screen bg-white px-6 py-7 lg:px-8">
      <BackofficePageHeader title="매핑/라벨 확인" />
      <JsonEntityBrowser entities={entities} />
    </div>
  );
}
