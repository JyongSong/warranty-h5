/**
 * 완료 사진 버킷에서 아무도 참조하지 않는 객체를 골라내는 규칙.
 *
 * 고아가 생기는 경로는 셋이다.
 *  1. 사진은 다 올라갔는데 제출이 실패한 경우. 재시도는 새 UUID 로 다시 올린다.
 *  2. 반려 후 재제출. installation_completions.photo_paths 가 통째로 교체되면서
 *     이전 사진들은 참조가 끊긴다.
 *  3. 큐에서 버려진 항목. (지금은 FAILED 로 남기지만 예전에는 조용히 지웠다.)
 *
 * 저장소만 늘어나는 것도 문제지만, 더 성가신 건 시간이 지날수록 "살아 있는
 * 파일" 과 "죽은 파일" 을 구분할 근거가 사라진다는 점이다. 그래서 참조 목록과의
 * 대조를 규칙으로 고정해 두고, 삭제는 별도 판단으로 남긴다.
 */

export type StorageObject = {
  /** 버킷 기준 전체 경로. 예: orders/<id>/<uuid>.jpg */
  path: string;
  createdAt: Date | null;
  sizeBytes: number;
};

export type OrphanScanResult = {
  orphans: StorageObject[];
  /** 참조되지 않지만 유예 기간 안이라 손대지 않은 것들. */
  tooRecent: StorageObject[];
  referencedCount: number;
  totalCount: number;
  orphanBytes: number;
};

export type FindOrphansOptions = {
  /** 이 시각보다 나중에 만들어진 객체는 건드리지 않는다. */
  createdBefore: Date;
};

/**
 * 참조되지 않는 객체를 찾는다.
 *
 * 유예 기간을 두는 이유: 기사가 사진을 올린 직후 아직 제출 버튼을 누르지 않았거나,
 * 오프라인 큐에 담긴 채 전송을 기다리는 사진이 있다. 방금 올라온 파일을 "아무도
 * 참조하지 않는다" 는 이유로 지우면 정상 제출을 망가뜨린다.
 *
 * 생성 시각을 모르는 객체(createdAt === null)도 유예 쪽에 둔다. 판단 근거가
 * 없는 파일을 지우는 것보다 남겨 두는 편이 안전하다.
 */
export function findOrphans(
  objects: StorageObject[],
  referencedPaths: Iterable<string>,
  options: FindOrphansOptions,
): OrphanScanResult {
  const referenced = referencedPaths instanceof Set ? referencedPaths : new Set(referencedPaths);

  const orphans: StorageObject[] = [];
  const tooRecent: StorageObject[] = [];
  let referencedCount = 0;

  for (const object of objects) {
    if (referenced.has(object.path)) {
      referencedCount += 1;
      continue;
    }
    if (object.createdAt === null || object.createdAt >= options.createdBefore) {
      tooRecent.push(object);
      continue;
    }
    orphans.push(object);
  }

  return {
    orphans,
    tooRecent,
    referencedCount,
    totalCount: objects.length,
    orphanBytes: orphans.reduce((sum, object) => sum + object.sizeBytes, 0),
  };
}

/** 고아를 상위 폴더(orders/<id> · as/<id>)별로 묶는다. 어디서 새는지 보려는 것. */
export function groupByPrefix(objects: StorageObject[]): Map<string, StorageObject[]> {
  const groups = new Map<string, StorageObject[]>();
  for (const object of objects) {
    const segments = object.path.split("/");
    const prefix = segments.length > 1 ? segments.slice(0, -1).join("/") : "(root)";
    const bucket = groups.get(prefix);
    if (bucket) bucket.push(object);
    else groups.set(prefix, [object]);
  }
  return groups;
}
