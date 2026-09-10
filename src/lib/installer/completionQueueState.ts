/**
 * 오프라인 큐 항목의 상태 전이 규칙. IndexedDB 와 분리해 둔 이유는 두 가지다.
 * 하나는 이 규칙이 "기사의 완료 등록이 조용히 사라지느냐" 를 좌우하는 부분이라
 * 테스트로 못박아야 하고, 다른 하나는 테스트 환경이 node 라 IndexedDB 를
 * 직접 돌릴 수 없기 때문이다.
 */

/** 자동 재시도를 포기하기까지의 횟수. 넘으면 FAILED 로 두고 사람이 판단한다. */
export const MAX_ATTEMPTS = 5;

export type QueueEntryState = "PENDING" | "FAILED";

export type QueueEntryStatus = {
  state: QueueEntryState;
  attempts: number;
  lastError: string | null;
  lastTriedAt: string | null;
};

export type FlushOutcome =
  | { ok: true }
  | { ok: false; retriable: boolean; error: string };

/**
 * 업로드가 왜 실패했는지 판정한다.
 *
 * 예전에는 업로드 중 발생한 모든 예외를 "NETWORK · 재시도 가능" 으로 뭉갰다.
 * 그래서 용량이 넘치는 사진 한 장이 통신 오류로 둔갑해, 기사는 "통신 상태를
 * 확인하세요" 만 보면서 절대 성공하지 않을 재시도를 반복했다.
 *
 * Supabase 의 StorageError 는 HTTP status 를 들고 오므로, 다시 시도해서
 * 달라질 실패(끊긴 연결·서버 오류·혼잡)와 몇 번을 보내도 같은 실패(용량 초과·
 * 형식 거부)를 구분할 수 있다. 후자는 첫 실패에서 바로 멈추고 사유를 보여준다.
 */
export function classifyUploadError(error: unknown): { retriable: boolean; error: string } {
  const status = readHttpStatus(error);

  if (status === null) {
    // fetch 자체가 못 나갔다 — 연결 문제로 본다.
    return { retriable: true, error: "NETWORK" };
  }

  // 인증 만료·타임아웃·혼잡은 다음 시도에 풀릴 수 있다.
  if (status === 401 || status === 403 || status === 408 || status === 429) {
    return { retriable: true, error: "UPLOAD_TEMPORARILY_REJECTED" };
  }
  if (status >= 500) {
    return { retriable: true, error: "STORAGE_UNAVAILABLE" };
  }

  if (status === 413) return { retriable: false, error: "PHOTO_TOO_LARGE" };
  if (status === 415) return { retriable: false, error: "PHOTO_TYPE_REJECTED" };
  if (status >= 400) return { retriable: false, error: "UPLOAD_REJECTED" };

  // 4xx·5xx 가 아닌데 예외로 올라온 경우. 판단이 서지 않으면 재시도 쪽에 둔다.
  return { retriable: true, error: "NETWORK" };
}

function readHttpStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isFinite(status) ? status : null;
}

/** 이번 결과 이후 이 항목을 어떻게 할 것인가. */
export type QueueDecision =
  | { action: "DELETE" }
  | { action: "KEEP"; status: QueueEntryStatus };

/**
 * 예전 버전이 저장한 항목에는 attempts/state 가 없다. IndexedDB 버전을 올리지
 * 않고 필드만 늘렸으므로, 읽을 때 기본값을 채워 준다. 이게 없으면 이미 기사
 * 휴대폰에 쌓여 있던 대기 항목이 업그레이드 직후 깨진다.
 */
export function readStatus(raw: Partial<QueueEntryStatus> | null | undefined): QueueEntryStatus {
  return {
    state: raw?.state === "FAILED" ? "FAILED" : "PENDING",
    attempts: typeof raw?.attempts === "number" && raw.attempts >= 0 ? raw.attempts : 0,
    lastError: raw?.lastError ?? null,
    lastTriedAt: raw?.lastTriedAt ?? null,
  };
}

/**
 * 전송 시도 결과를 상태 전이로 바꾼다.
 *
 * 성공만 삭제한다. 예전에는 "재시도 불가" 를 곧바로 삭제했는데, 그러면 기사가
 * 올린 완료 등록이 사진까지 통째로, 아무 알림 없이 사라졌다. 이제는 FAILED 로
 * 남겨서 화면에 드러내고, 지울지 말지는 기사가 정한다.
 */
export function nextStatus(
  current: QueueEntryStatus,
  outcome: FlushOutcome,
  now: Date = new Date(),
): QueueDecision {
  if (outcome.ok) return { action: "DELETE" };

  const attempts = current.attempts + 1;
  const exhausted = attempts >= MAX_ATTEMPTS;

  return {
    action: "KEEP",
    status: {
      state: !outcome.retriable || exhausted ? "FAILED" : "PENDING",
      attempts,
      lastError: outcome.error,
      lastTriedAt: now.toISOString(),
    },
  };
}

/** 자동 전송 대상인지. FAILED 는 사람이 다시 시도를 눌러야 움직인다. */
export function isAutoFlushable(status: QueueEntryStatus): boolean {
  return status.state === "PENDING";
}

/** '다시 시도' 를 눌렀을 때. 시도 횟수를 되돌려 자동 전송 대상으로 되돌린다. */
export function resetForRetry(): QueueEntryStatus {
  return { state: "PENDING", attempts: 0, lastError: null, lastTriedAt: null };
}
