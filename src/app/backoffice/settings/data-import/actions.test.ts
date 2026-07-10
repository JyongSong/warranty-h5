import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";
import { prisma } from "@/lib/prisma";
import { importBackofficeDataAction } from "./actions";
import { initialDataImportActionState } from "./state";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/login/backofficeAuth", () => ({
  getCurrentBackofficeUser: vi.fn(),
}));

const { installerCreateMany, installerUpsert } = vi.hoisted(() => ({
  installerCreateMany: vi.fn(),
  installerUpsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installer: {
      createMany: installerCreateMany,
      upsert: installerUpsert,
    },
  },
}));

const getCurrentBackofficeUserMock = vi.mocked(getCurrentBackofficeUser);
const prismaMock = vi.mocked(prisma);

describe("backoffice data import action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentBackofficeUserMock.mockResolvedValue({
      id: "admin-1",
      supabaseUserId: "supabase-user-1",
      email: "admin@example.com",
      level: 1,
    });
  });

  it("upserts installers by unique phone and separates upload duplicates from skipped rows", async () => {
    installerUpsert.mockResolvedValue({});

    const result = await importBackofficeDataAction(
      initialDataImportActionState,
      formData("installers", `성명,전화번호,지점,광역,지역,주소,소속 조직
홍길동,010-1111-2222,강남,서울,강남구,서울 강남구,도어락
중복기사,01011112222,강남,서울,서초구,서울 서초구,도어락
김기사,010 3333 4444,부산,부산,해운대구,부산 해운대구,도어락
잘못된번호,12345,부산,부산,해운대구,부산 해운대구,도어락
`),
    );

    expect(result).toMatchObject({
      ok: true,
      kind: "installers",
      imported: 2,
      duplicates: 1,
      skipped: 1,
      failed: 1,
      total: 4,
      message: "전체 4개, 저장 2개, 중복 1개, 제외 1개",
    });
    expect(prismaMock.installer.createMany).not.toHaveBeenCalled();
    expect(prismaMock.installer.upsert).toHaveBeenCalledTimes(2);
    expect(prismaMock.installer.upsert).toHaveBeenNthCalledWith(1, {
      where: { phone: "01011112222" },
      create: {
        name: "중복기사",
        phone: "01011112222",
        branch: "강남",
        region: "서울",
        coverage: "서초구",
        address: "서울 서초구",
        category: "도어락",
      },
      update: {
        name: "중복기사",
        branch: "강남",
        region: "서울",
        coverage: "서초구",
        address: "서울 서초구",
        category: "도어락",
      },
    });
    expect(prismaMock.installer.upsert).toHaveBeenNthCalledWith(2, {
      where: { phone: "01033334444" },
      create: {
        name: "김기사",
        phone: "01033334444",
        branch: "부산",
        region: "부산",
        coverage: "해운대구",
        address: "부산 해운대구",
        category: "도어락",
      },
      update: {
        name: "김기사",
        branch: "부산",
        region: "부산",
        coverage: "해운대구",
        address: "부산 해운대구",
        category: "도어락",
      },
    });
  });

  it("imports installer rows from an Excel workbook upload", async () => {
    installerUpsert.mockResolvedValue({});

    const result = await importBackofficeDataAction(
      initialDataImportActionState,
      workbookFormData("installers", [
        {
          "성명": "엑셀기사",
          "전화번호": "010-5555-6666",
          "지점": "강남",
          "광역": "서울",
          "지역": "강남구",
          "주소": "서울 강남구",
          "소속 조직": "도어락",
        },
      ]),
    );

    expect(result).toMatchObject({
      ok: true,
      kind: "installers",
      imported: 1,
      failed: 0,
      total: 1,
    });
    expect(prismaMock.installer.upsert).toHaveBeenCalledWith({
      where: { phone: "01055556666" },
      create: {
        name: "엑셀기사",
        phone: "01055556666",
        branch: "강남",
        region: "서울",
        coverage: "강남구",
        address: "서울 강남구",
        category: "도어락",
      },
      update: {
        name: "엑셀기사",
        branch: "강남",
        region: "서울",
        coverage: "강남구",
        address: "서울 강남구",
        category: "도어락",
      },
    });
  });

  it("imports installer rows from the installer list workbook format", async () => {
    installerUpsert.mockResolvedValue({});

    const result = await importBackofficeDataAction(
      initialDataImportActionState,
      workbookFormData("installers", [
        {
          "성명": "강남/열쇠닥터",
          "전화번호": "010-5168-2509",
          "지점명": "강남지점",
          "광역": "서울",
          "지역": "강남구, 서초구, 송파구, 강동구",
          "주소": "서울 강남구",
          "소속 조직": "선택적",
        },
        ...Array.from({ length: 10 }, (_, index) => ({
          "성명": `테스트기사${index + 1}`,
          "전화번호": `010-1000-10${String(index).padStart(2, "0")}`,
          "지점명": "서울지점",
          "광역": "서울",
          "지역": "서울",
          "주소": "서울",
          "소속 조직": "선택적",
        })),
        {
          "성명": "전화번호없는기사",
          "전화번호": "",
          "지점명": "서울지점",
          "광역": "서울",
          "지역": "서울",
          "주소": "서울",
          "소속 조직": "선택적",
        },
      ]),
    );

    expect(result).toMatchObject({
      ok: true,
      kind: "installers",
      imported: 11,
      duplicates: 0,
      failed: 1,
      total: 12,
    });
    expect(prismaMock.installer.upsert).toHaveBeenCalledWith({
      where: { phone: "01051682509" },
      create: {
        name: "강남/열쇠닥터",
        phone: "01051682509",
        branch: "강남지점",
        region: "서울",
        coverage: "강남구, 서초구, 송파구, 강동구",
        address: "서울 강남구",
        category: "선택적",
      },
      update: {
        name: "강남/열쇠닥터",
        branch: "강남지점",
        region: "서울",
        coverage: "강남구, 서초구, 송파구, 강동구",
        address: "서울 강남구",
        category: "선택적",
      },
    });
  });

  it("allows selecting CSV and Excel files in the upload input", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/backoffice/settings/data-import/DataImportForm.tsx"),
      "utf8",
    );

    expect(source).toContain('accept=".csv,text/csv,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"');
    expect(source).toContain("CSV/엑셀 파일");
    expect(source).toContain("저장될 데이터 미리보기");
    expect(source).toContain("onChange={handleFileChange}");
    expect(source).not.toContain("출고 기기 데이터 가져오기");
    expect(source).not.toContain("SN을 기준으로 중복 없이 저장합니다");
    expect(source).toContain('{ key: "name", label: "name" }');
    expect(source).toContain('{ key: "phone", label: "phone" }');
    expect(source).toContain('{ key: "coverage", label: "coverage" }');
  });

  it("shows the server-processed preview after an import result is available", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/backoffice/settings/data-import/DataImportForm.tsx"),
      "utf8",
    );

    expect(source).toContain("state.ok ? state.preview");
    expect(source).toContain("state.ok ? \"처리 데이터 미리보기\"");
  });

  it("keeps only the installer import page", () => {
    const basePath = join(process.cwd(), "src/app/backoffice/settings/data-import");
    const dataImportPageSource = readFileSync(join(basePath, "page.tsx"), "utf8");
    const shippedPagePath = join(basePath, "shipped-devices", "page.tsx");
    const installersPagePath = join(basePath, "installers", "page.tsx");

    expect(existsSync(shippedPagePath)).toBe(false);
    expect(existsSync(installersPagePath)).toBe(true);
    expect(dataImportPageSource).toContain('redirect("/backoffice/settings/data-import/installers")');
    expect(readFileSync(installersPagePath, "utf8")).toContain('kind="installers"');
  });

  it("embeds the matching column mapping reference inside each import page body", () => {
    const basePath = join(process.cwd(), "src/app/backoffice/settings/data-import");
    const formSource = readFileSync(join(basePath, "DataImportForm.tsx"), "utf8");
    const installersPageSource = readFileSync(join(basePath, "installers", "page.tsx"), "utf8");

    expect(installersPageSource).toContain("getDataImportColumnMapEntity()");
    expect(formSource).toContain("columnMapEntity");
    expect(formSource).not.toContain("{columnMapEntity.category}");
    expect(formSource).not.toContain("적용 컬럼 매핑");
    expect(formSource).toContain("원문 JSON");
    expect(formSource).toContain("columnMapEntity.filePath");
  });
});

function formData(kind: "installers", csv: string) {
  const data = new FormData();
  data.set("kind", kind);
  data.set("file", new File([csv], "data.csv", { type: "text/csv" }));
  return data;
}

function workbookFormData(kind: "installers", rows: Record<string, string>[]) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

  const data = new FormData();
  data.set("kind", kind);
  data.set(
    "file",
    new File([buffer], "data.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  return data;
}
