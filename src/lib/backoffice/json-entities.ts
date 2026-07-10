import installerImportColumnMap from "@/lib/backoffice/installer-import-column-map.json";
import installationEventLabels from "@/lib/installation/orders/views/label-installation-event.json";
import installationStatusLabels from "@/lib/installation/orders/views/label-installation-status.json";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type BackofficeJsonEntity = {
  id: string;
  label: string;
  description: string;
  category: string;
  filePath: string;
  value: JsonValue;
};

export type JsonEntityKeyValueRow = {
  key: string;
  value: string;
};

export type JsonEntityArrayDisplayItem = {
  id: string;
  label: string;
  rows: JsonEntityKeyValueRow[];
};

export type JsonEntityDisplay =
  | {
      kind: "array";
      items: JsonEntityArrayDisplayItem[];
    }
  | {
      kind: "object";
      rows: JsonEntityKeyValueRow[];
    };

export function getBackofficeJsonEntities(): BackofficeJsonEntity[] {
  return [
    {
      id: "installation-order-status-label-installation-status",
      label: "설치 워크플로 상태 라벨",
      description: "설치 상태 코드를 화면 표시명으로 변환하는 라벨입니다.",
      category: "개발 참고 라벨",
      filePath: "src/lib/installation/orders/views/label-installation-status.json",
      value: installationStatusLabels,
    },
    {
      id: "installation-order-status-label-installation-event",
      label: "설치 워크플로 이벤트 라벨",
      description: "설치 이벤트 코드를 화면 표시명으로 변환하는 라벨입니다.",
      category: "개발 참고 라벨",
      filePath: "src/lib/installation/orders/views/label-installation-event.json",
      value: installationEventLabels,
    },
  ];
}

export function getDataImportColumnMapEntity(): BackofficeJsonEntity {
  return {
    id: "backoffice-data-import-installer-column-map",
    label: "설치 기사 가져오기 컬럼 매핑",
    description: "설치 기사 엑셀/CSV 헤더를 저장 컬럼에 연결하는 운영 매핑입니다.",
    category: "운영 매핑",
    filePath: "src/lib/backoffice/installer-import-column-map.json",
    value: installerImportColumnMap,
  };
}

export function flattenJsonEntityValues(value: JsonValue): JsonEntityKeyValueRow[] {
  return flattenJsonValue(value, "");
}

export function buildJsonEntityDisplay(value: JsonValue): JsonEntityDisplay {
  if (!Array.isArray(value)) {
    return {
      kind: "object",
      rows: flattenJsonEntityValues(value),
    };
  }

  return {
    kind: "array",
    items: value.map((item, index) => ({
      id: String(index),
      label: String(index + 1),
      rows: flattenJsonEntityValues(item),
    })),
  };
}

function flattenJsonValue(value: JsonValue, path: string): JsonEntityKeyValueRow[] {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [{ key: path || "(root)", value: "[]" }];
    }

    if (value.every(isJsonPrimitive)) {
      return [{ key: path || "(root)", value: value.map(formatJsonPrimitive).join(", ") }];
    }

    return value.flatMap((item, index) => flattenJsonValue(item, `${path}[${index}]`));
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);

    if (entries.length === 0) {
      return [{ key: path || "(root)", value: "{}" }];
    }

    return entries.flatMap(([key, item]) =>
      flattenJsonValue(item, path ? `${path}.${key}` : key),
    );
  }

  return [{ key: path || "(root)", value: formatJsonPrimitive(value) }];
}

function formatJsonPrimitive(value: JsonPrimitive) {
  if (value === null) return "null";
  return String(value);
}

function isJsonPrimitive(value: JsonValue): value is JsonPrimitive {
  return value === null || typeof value !== "object";
}
