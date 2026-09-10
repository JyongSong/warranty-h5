import { describe, expect, it } from "vitest";
import { findOrphans, groupByPrefix, type StorageObject } from "./orphanPhotos";

const CUTOFF = new Date("2026-09-10T00:00:00.000Z");
const OLD = new Date("2026-09-01T00:00:00.000Z");
const NEW = new Date("2026-09-10T12:00:00.000Z");

const obj = (path: string, createdAt: Date | null, sizeBytes = 1000): StorageObject => ({
  path,
  createdAt,
  sizeBytes,
});

describe("findOrphans", () => {
  it("참조된 객체는 오래됐어도 남긴다", () => {
    const result = findOrphans(
      [obj("orders/a/1.jpg", OLD)],
      ["orders/a/1.jpg"],
      { createdBefore: CUTOFF },
    );
    expect(result.orphans).toEqual([]);
    expect(result.referencedCount).toBe(1);
  });

  it("참조가 없고 유예 기간을 지난 객체만 고아로 본다", () => {
    const result = findOrphans([obj("orders/a/dead.jpg", OLD)], [], { createdBefore: CUTOFF });
    expect(result.orphans.map((o) => o.path)).toEqual(["orders/a/dead.jpg"]);
  });

  it("방금 올라온 객체는 참조가 없어도 건드리지 않는다", () => {
    // 기사가 사진만 올리고 아직 제출을 안 눌렀거나, 오프라인 큐에서
    // 전송을 기다리는 중일 수 있다. 여기서 지우면 정상 제출이 깨진다.
    const result = findOrphans([obj("orders/a/pending.jpg", NEW)], [], { createdBefore: CUTOFF });
    expect(result.orphans).toEqual([]);
    expect(result.tooRecent.map((o) => o.path)).toEqual(["orders/a/pending.jpg"]);
  });

  it("생성 시각을 모르는 객체는 지우지 않고 유예로 둔다", () => {
    const result = findOrphans([obj("orders/a/unknown.jpg", null)], [], { createdBefore: CUTOFF });
    expect(result.orphans).toEqual([]);
    expect(result.tooRecent).toHaveLength(1);
  });

  it("고아 용량을 합산한다", () => {
    const result = findOrphans(
      [obj("orders/a/1.jpg", OLD, 1500), obj("as/b/2.jpg", OLD, 2500), obj("orders/a/3.jpg", OLD, 0)],
      [],
      { createdBefore: CUTOFF },
    );
    expect(result.orphans).toHaveLength(3);
    expect(result.orphanBytes).toBe(4000);
  });

  it("설치와 A/S 참조를 함께 대조한다", () => {
    const result = findOrphans(
      [
        obj("orders/a/keep.jpg", OLD),
        obj("orders/a/dead.jpg", OLD),
        obj("as/b/keep.jpg", OLD),
        obj("as/b/dead.jpg", OLD),
      ],
      new Set(["orders/a/keep.jpg", "as/b/keep.jpg"]),
      { createdBefore: CUTOFF },
    );
    expect(result.orphans.map((o) => o.path).sort()).toEqual(["as/b/dead.jpg", "orders/a/dead.jpg"]);
    expect(result.referencedCount).toBe(2);
    expect(result.totalCount).toBe(4);
  });

  it("빈 버킷도 처리한다", () => {
    const result = findOrphans([], [], { createdBefore: CUTOFF });
    expect(result).toEqual({
      orphans: [],
      tooRecent: [],
      referencedCount: 0,
      totalCount: 0,
      orphanBytes: 0,
    });
  });
});

describe("groupByPrefix", () => {
  it("주문 폴더별로 묶는다", () => {
    const groups = groupByPrefix([
      obj("orders/a/1.jpg", OLD),
      obj("orders/a/2.jpg", OLD),
      obj("as/b/1.jpg", OLD),
    ]);
    expect(groups.get("orders/a")).toHaveLength(2);
    expect(groups.get("as/b")).toHaveLength(1);
  });

  it("폴더가 없는 객체도 떨어뜨리지 않는다", () => {
    const groups = groupByPrefix([obj("stray.jpg", OLD)]);
    expect(groups.get("(root)")).toHaveLength(1);
  });
});
