import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildJsonEntityDisplay,
  flattenJsonEntityValues,
  getBackofficeJsonEntities,
  getDataImportColumnMapEntity,
} from "@/lib/backoffice/json-entities";
import installationEventLabels from "@/lib/installation/orders/views/label-installation-event.json";
import installationStatusLabels from "@/lib/installation/orders/views/label-installation-status.json";
import installerImportColumnMap from "@/lib/backoffice/installer-import-column-map.json";

describe("backoffice JSON entities", () => {
  test("lists JSON-defined entities used by the backoffice flow", () => {
    const entities = getBackofficeJsonEntities();
    const entityIds = entities.map((entity) => entity.id);

    expect(entityIds).toContain("installation-order-status-label-installation-status");
    expect(entityIds).toContain("installation-order-status-label-installation-event");
    expect(entityIds).not.toContain("installation-order-status-label-installation-sms-retry");
    expect(entityIds).not.toContain("installation-order-status-label-installation-title-action");
    expect(entityIds).not.toContain("backoffice-data-import-shipped-device-column-map");
    expect(entityIds).not.toContain("backoffice-data-import-installer-column-map");
    expect(entityIds).not.toContain("installation-installer-directory");
    expect(entityIds).not.toContain("sms-template-customer-reservation-link");
    expect(entityIds).not.toContain("customer-preferred-date-fixture");
    expect(entityIds).not.toContain("installer-confirm-assignment-fixture");
    expect(entityIds).not.toContain("installation-order-status-label-installation-detail");
    expect(entities.some((entity) => entity.category === "SMS 템플릿")).toBe(false);
    expect(entities.some((entity) => entity.filePath.includes("dummy-"))).toBe(false);
  });

  test("does not list page-local installation detail copy as JSON entities", () => {
    const entities = getBackofficeJsonEntities();
    const entityLabels = entities.map((entity) => entity.label);

    expect(entityLabels).not.toContain("설치 워크플로 SMS 재시도 라벨");
    expect(entityLabels).not.toContain("설치 주문 제목/액션 라벨");
  });

  test("does not duplicate data import column mapping entities in the JSON entity browser", () => {
    const entities = getBackofficeJsonEntities();
    const entityIds = entities.map((entity) => entity.id);

    expect(entityIds).not.toContain("backoffice-data-import-shipped-device-column-map");
    expect(entityIds).not.toContain("backoffice-data-import-installer-column-map");
    expect(entities.map((entity) => entity.label)).not.toContain("출고 기기 가져오기 컬럼 매핑");
    expect(entities.map((entity) => entity.label)).not.toContain("설치 기사 가져오기 컬럼 매핑");
  });

  test("returns the installer data import column map entity", () => {
    expect(getDataImportColumnMapEntity()).toEqual(
      expect.objectContaining({
        id: "backoffice-data-import-installer-column-map",
        label: "설치 기사 가져오기 컬럼 매핑",
        value: installerImportColumnMap,
      }),
    );
  });

  test("flattens nested JSON values into readable key-value rows", () => {
    const rows = flattenJsonEntityValues({
      statusLabels: {
        READY_FOR_CANDIDATE_SELECTION: "후보 선정 가능",
      },
      itemRules: [
        {
          match: "K100",
          requiredCapabilities: ["DOORLOCK"],
        },
      ],
    });

    expect(rows).toEqual([
      { key: "statusLabels.READY_FOR_CANDIDATE_SELECTION", value: "후보 선정 가능" },
      { key: "itemRules[0].match", value: "K100" },
      { key: "itemRules[0].requiredCapabilities", value: "DOORLOCK" },
    ]);
  });

  test("shows primitive arrays as a single comma-separated value", () => {
    expect(
      flattenJsonEntityValues({
        name: ["성명", "지정명"],
        branch: ["지점", "지정명"],
        phone: "전화번호",
      }),
    ).toEqual([
      { key: "name", value: "성명, 지정명" },
      { key: "branch", value: "지점, 지정명" },
      { key: "phone", value: "전화번호" },
    ]);
  });

  test("builds an extra index selection level for root arrays", () => {
    expect(
      buildJsonEntityDisplay([
        { match: "K100", itemCode: "00049" },
        { match: "L100", itemCode: "00048" },
      ]),
    ).toEqual({
      kind: "array",
      items: [
        {
          id: "0",
          label: "1",
          rows: [
            { key: "match", value: "K100" },
            { key: "itemCode", value: "00049" },
          ],
        },
        {
          id: "1",
          label: "2",
          rows: [
            { key: "match", value: "L100" },
            { key: "itemCode", value: "00048" },
          ],
        },
      ],
    });
  });

  test("keeps root objects as a single key-value table", () => {
    expect(
      buildJsonEntityDisplay({
        subject: "설치 안내",
        enabled: true,
      }),
    ).toEqual({
      kind: "object",
      rows: [
        { key: "subject", value: "설치 안내" },
        { key: "enabled", value: "true" },
      ],
    });
  });

  test("keeps documented workflow JSON in sync with runtime JSON", () => {
    const documentedStatusLabels = JSON.parse(
      readFileSync(join(process.cwd(), "docs", "plans", "label-installation-status.json"), "utf8"),
    );
    const documentedEventLabels = JSON.parse(
      readFileSync(join(process.cwd(), "docs", "plans", "label-installation-event.json"), "utf8"),
    );
    expect(installationStatusLabels).toEqual(documentedStatusLabels);
    expect(installationEventLabels).toEqual(documentedEventLabels);
  });

  test("keeps reusable workflow labels separated from page copy", () => {
    expect(installationStatusLabels).not.toHaveProperty("eventLabels");
    expect(installationEventLabels).not.toHaveProperty("statusLabels");
  });
});
