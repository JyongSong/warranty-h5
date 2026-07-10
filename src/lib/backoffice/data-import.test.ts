import { describe, expect, it } from "vitest";
import {
  parseInstallerRecords,
  parseInstallerCsv,
} from "@/lib/backoffice/data-import";

describe("backoffice data import", () => {
  it("parses installer csv rows with the configured installer table headers", () => {
    const result = parseInstallerCsv(`성명,전화번호,지점,광역,지역,주소,소속 조직
홍길동,010-1111-2222,강남,서울,"강남구, 서초구",서울 강남구,도어락
전화없음,,강남,서울,강남구,서울 강남구,도어락
김기사,010 3333 4444,부산,부산,해운대구,부산 해운대구,도어락
`);

    expect(result).toMatchObject({
      total: 3,
      skipped: 1,
    });
    expect(result.rows).toEqual([
      {
        name: "홍길동",
        phone: "01011112222",
        branch: "강남",
        region: "서울",
        coverage: "강남구, 서초구",
        address: "서울 강남구",
        category: "도어락",
      },
      {
        name: "김기사",
        phone: "01033334444",
        branch: "부산",
        region: "부산",
        coverage: "해운대구",
        address: "부산 해운대구",
        category: "도어락",
      },
    ]);
  });

  it("skips installer rows with malformed phone numbers", () => {
    const result = parseInstallerCsv(`성명,전화번호,지점,광역,지역,주소,소속 조직
짧은번호,12345,강남,서울,강남구,서울 강남구,도어락
일반전화,02-123-4567,강남,서울,강남구,서울 강남구,도어락
정상기사,010-3333-4444,부산,부산,해운대구,부산 해운대구,도어락
`);

    expect(result).toMatchObject({
      total: 3,
      skipped: 2,
    });
    expect(result.rows).toEqual([
      {
        name: "정상기사",
        phone: "01033334444",
        branch: "부산",
        region: "부산",
        coverage: "해운대구",
        address: "부산 해운대구",
        category: "도어락",
      },
    ]);
  });

  it("maps branch from 지점 before falling back to 지점명", () => {
    const result = parseInstallerRecords([
      {
        성명: "홍길동",
        전화번호: "010-1111-2222",
        지점: "강남",
        지점명: "강남/열쇠닥터",
      },
      {
        성명: "김기사",
        전화번호: "010-3333-4444",
        지점명: "부산/열쇠특공대",
      },
    ]);

    expect(result).toMatchObject({
      total: 2,
      skipped: 0,
    });
    expect(result.rows.map((row) => row.branch)).toEqual(["강남", "부산/열쇠특공대"]);
  });

  it("maps installer records from database columns to configured Excel headers", () => {
    const result = parseInstallerRecords(
      [
        {
          지점명: "강남지점",
          전화번호: "010-1111-2222",
          광역: "서울",
          무시할컬럼: "저장하지 않음",
        },
      ],
      {
        name: "지점명",
        phone: "전화번호",
        branch: "지점명",
        region: "광역",
      },
    );

    expect(result).toMatchObject({
      total: 1,
      skipped: 0,
    });
    expect(result.rows).toEqual([
      {
        name: "강남지점",
        phone: "01011112222",
        branch: "강남지점",
        region: "서울",
      },
    ]);
  });

  it("does not store optional installer columns that are not present in the mapping", () => {
    const result = parseInstallerRecords(
      [
        {
          기사명: "홍길동",
          휴대폰: "010-3333-4444",
          지점: "강남",
          지역: "강남구",
        },
      ],
      {
        name: "기사명",
        phone: "휴대폰",
      },
    );

    expect(result.rows).toEqual([
      {
        name: "홍길동",
        phone: "01033334444",
      },
    ]);
  });
});
