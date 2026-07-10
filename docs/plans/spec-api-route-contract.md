# 설치 배정 API/Route 계약서

> 목적: 설치 배정 화면, Server Action, API endpoint의 request/response shape를 정의한다.
> 기준 문서: `docs/plan/spec-feature-list.md`, `docs/plan/spec-candidate-policy.md`, `docs/plan/spec-flow-state.md`, `docs/plan/spec-operational-constants.md`, `docs/plan/spec-external-integration-contract.md`

## 1. 공통 계약

### 1.1 응답 envelope

Server Action과 JSON API는 성공/실패를 아래 형태로 구분한다.

```ts
type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? Record<string, never> : T))
  | { ok: false; error: string; message?: string };
```

### 1.2 상태 enum

API와 화면은 설치 예약 상태를 아래 값으로만 노출한다.

```ts
type InstallationReservationStatus =
  | "CUSTOMER_INPUT_SMS_REQUIRED"
  | "WAITING_CUSTOMER_INPUT"
  | "READY_FOR_CANDIDATE_SELECTION"
  | "WAITING_ADMIN_REVIEW"
  | "WAITING_INSTALLER_RESPONSE"
  | "INSTALLER_ASSIGNED"
  | "CANCELLED"
  | "COMPLETED";

type AssignmentAttemptType = "AUTO" | "MANUAL_DIRECT" | "ADMIN_RETRY";

type AssignmentAttemptStatus =
  | "WAITING_INSTALLER_RESPONSE"
  | "SYSTEM_SMS_RETRY_PENDING"
  | "INSTALLER_ACCEPTED"
  | "INSTALLER_REJECTED"
  | "INSTALLER_RESPONSE_TIMED_OUT"
  | "SYSTEM_SMS_FAILED"
  | "ADMIN_MANUAL_OVERRIDDEN"
  | "ADMIN_COMPLETED";

type CandidateRunReasonCode =
  | "MISSING_INSTALL_DATE"
  | "INSTALL_DATE_TOO_SOON"
  | "INSTALL_DATE_TOO_LATE"
  | "UNPARSABLE_INSTALL_ADDRESS"
  | "UNMAPPED_PRODUCT_REQUIREMENT"
  | "NO_CAPABILITY_MATCH"
  | "NO_REGION_MATCH"
  | "POLICY_DATA_ERROR"
  | "DATA_INTEGRITY_ERROR"
  | "AUTO_ATTEMPT_LIMIT_EXCEEDED"
  | "ACTIVE_ATTEMPT_EXISTS"
  | "SYSTEM_SMS_RETRY_PENDING"
  | "STATUS_NOT_AUTO_REQUESTABLE";

type InstallationIssueCode =
  | "NO_INSTALLER_CANDIDATE"
  | "INSTALLER_CANDIDATES_EXHAUSTED"
  | "INSUFFICIENT_CUSTOMER_INFO"
  | "SMS_FAILED"
  | "DUE_SOON";

type CandidateExcludedReason =
  | "INACTIVE_INSTALLER"
  | "MISSING_REQUIRED_CAPABILITY"
  | "AQARA_APP_CAPABILITY_NOT_MET"
  | "REGION_NOT_MATCHED"
  | "ALREADY_REQUESTED"
  | "ADMIN_EXCLUDED";

type ActiveAssignmentAttemptSnapshot = {
  id: string;
  assignmentType: AssignmentAttemptType;
  assignmentStatus: "WAITING_INSTALLER_RESPONSE" | "SYSTEM_SMS_RETRY_PENDING";
  smsRetryPending: boolean;
};
```

### 1.3 인증 원칙

| 구분 | 인증 |
|---|---|
| 고객 입력 화면 | 고객 입력 token |
| 설치 기사 응답 화면 | 설치 기사 응답 token |
| 관리자 화면/Server Action | 관리자 세션, level `>= 1` |
| Cron endpoint | `Authorization: Bearer <CRON_SECRET>` |

## 2. 페이지별 계약

| Page route | 사용자 | Query/params | Data source | Action/API |
|---|---|---|---|---|
| `/i/c/[token]` | 고객 | `token`, `mock?` | 고객 입력 token 조회 | `submitCustomerRequestAction` |
| `/i/i/[token]` | 설치 기사 | `token`, `mock?` | 배정 응답 token 조회 | `submitInstallerResponseAction` |
| `/backoffice/installations` | 관리자 | `view?`, `mock?` | 설치건 목록 또는 예외/검토 목록 | 관리자 Server Actions |
| `/backoffice/installations/[installationId]` | 관리자 | `installationId` | 설치건 상세, 후보, 이력, 예외 | 관리자 Server Actions |

## 3. 고객 입력 Server Action

### `submitCustomerRequestAction`

호출 위치: `/i/c/[token]`

```ts
type SubmitCustomerRequestInput = {
  token: string; // `/i/c/{token}` path param
  installAddress: string;
  installDate: string; // YYYY-MM-DD
  customerPhone: string;
  customerNote?: string | null;
};

type SubmitCustomerRequestResult =
  | {
      ok: true;
      installationId: string;
      status: "READY_FOR_CANDIDATE_SELECTION";
    }
  | {
      ok: false;
      error:
        | "MISSING_TOKEN"
        | "TOKEN_NOT_FOUND"
        | "TOKEN_EXPIRED"
        | "ALREADY_SUBMITTED"
        | "INVALID_INSTALL_DATE"
        | "INVALID_INSTALL_ADDRESS"
        | "INVALID_CUSTOMER_PHONE"
        | "INTERNAL_ERROR";
      message: string;
    };
```

### 고객 입력 초기 조회 shape

```ts
type CustomerRequestPageInfo =
  | {
      status: "VALID";
      request: {
        id: string;
        customerName: string;
        customerPhone: string | null;
        installAddress: string | null;
        installDate: string | null;
        customerNote: string | null;
        installationOrder: {
          sourceErpOrderNo: string;
          sourceCustomerName: string;
          sourcePhone: string;
          sourceAddress: string | null;
        };
      };
    }
  | { status: "NOT_FOUND" }
  | { status: "EXPIRED" }
  | { status: "SUBMITTED" };
```

고객 입력 검증 실패는 화면 오류로 처리하고 설치 예약 상태를 변경하지 않는다.

## 4. 설치 기사 응답 Server Action

### `submitInstallerResponseAction`

호출 위치: `/i/i/[token]`

```ts
type SubmitInstallerResponseInput = {
  token: string; // `/i/i/{token}` path param
  response: "ACCEPT" | "REJECT";
  rejectReason?: string | null;
};

type SubmitInstallerResponseResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "MISSING_TOKEN"
        | "TOKEN_NOT_FOUND"
        | "TOKEN_EXPIRED"
        | "ALREADY_RESPONDED"
        | "ASSIGNMENT_NOT_WAITING_INSTALLER_RESPONSE"
        | "INSTALLER_RESPONSE_FAILED";
    };
```

### 설치 기사 응답 초기 조회 shape

수락 전에는 고객 전체 이름, 전화번호, 상세 주소를 노출하지 않는다.

```ts
type InstallerResponsePageInfo =
  | {
      status: "VALID";
      assignment: {
        id: string;
        installerId: string;
        assignmentType: AssignmentAttemptType;
        assignmentStatus: "WAITING_INSTALLER_RESPONSE";
        installationOrder: {
          installDate: string | null;
          approximateRegion: string;
          productSummary: string;
          requiredCapabilities: string[];
        };
      };
    }
  | { status: "NOT_FOUND" }
  | { status: "EXPIRED" }
  | { status: "CLOSED" };
```

수락 성공 시 설치 예약은 `INSTALLER_ASSIGNED`가 되고, 현재 배정 시도는 `INSTALLER_ACCEPTED`로 종료한다. 거절 성공 시 배정 시도 유형이 `AUTO`이면 차순위 자동 진행 대상이 되고, `MANUAL_DIRECT` 또는 `ADMIN_RETRY`이면 열린 예외를 가진 수동 처리 필요 설치건으로 복귀한다.

## 5. 관리자 Server Actions

공통 실패:

```ts
type AdminActionFailure =
  | { ok: false; error: "UNAUTHORIZED" }
  | { ok: false; error: "FORBIDDEN" }
  | { ok: false; error: string };
```

### `createManualInstallationAssignmentAction`

호출 위치: `/backoffice/installations/[installationId]`

```ts
type CreateManualInstallationAssignmentInput = {
  installationId: string;
  installerId: string;
  manualReason?: string | null; // 지역 매칭 미충족 기사 지정 시 필수
};

type CreateManualInstallationAssignmentResult =
  | {
      ok: true;
      assignmentId: string;
      status: "WAITING_INSTALLER_RESPONSE";
      activeAttempt: ActiveAssignmentAttemptSnapshot;
    }
  | {
      ok: false;
      error:
        | "INSTALLATION_NOT_ATTENTION_REQUIRED"
        | "INSTALLER_INACTIVE"
        | "INSTALLER_CAPABILITY_NOT_MET"
        | "AQARA_APP_CAPABILITY_NOT_MET"
        | "MANUAL_REASON_REQUIRED_FOR_REGION_MISMATCH"
        | "DUPLICATE_INSTALLER_REQUEST"
        | "SYSTEM_SMS_RETRY_PENDING"
        | "SMS_FAILED";
      message?: string;
    }
  | AdminActionFailure;
```

직접 지정은 열린 예외가 있는 수동 처리 필요 설치건에서만 허용한다. 비활성 설치 기사, 필수 설치 능력 미충족 설치 기사, Aqara App 요구 등급 미충족 설치 기사는 지정할 수 없다. 지역 매칭 기준을 충족하지 못하는 설치 기사를 지정하려면 `manualReason`이 필수다. 요청 SMS 일시 실패 시 설치 예약의 현재 상태를 유지하고 같은 배정 시도를 `SYSTEM_SMS_RETRY_PENDING`으로 기록한다. 최종 실패 시 배정 시도는 `SYSTEM_SMS_FAILED`로 종료하고 `SMS_FAILED` 예외를 만든다.

### `retryInstallationOrderAssignmentByAdminAction`

호출 위치: `/backoffice/installations/[installationId]`

```ts
type RetryInstallationOrderAssignmentByAdminInput = {
  installationId: string;
};

type RetryInstallationOrderAssignmentByAdminResult =
  | {
      ok: true;
      assignmentId: string | null;
      status: "WAITING_ADMIN_REVIEW" | "READY_FOR_CANDIDATE_SELECTION";
      activeAttempt: ActiveAssignmentAttemptSnapshot | null;
      reasonCode?: CandidateRunReasonCode | InstallationIssueCode;
    }
  | AdminActionFailure;
```

재실행 결과 후보가 있으면 `WAITING_ADMIN_REVIEW`로 전환하고 기사 SMS는 발송하지 않는다. 재실행 결과 후보가 없으면 현재 스키마 상태를 유지하고 `NO_INSTALLER_CANDIDATE` 예외를 만든다. 관리자가 승인한 요청이 거절 또는 timeout으로 종료되면 차순위 자동 요청을 진행하지 않고 열린 예외를 가진 수동 처리 필요 설치건으로 복귀한다.

### `approveInstallationAssignmentAction`

호출 위치: `/backoffice/installation-assignment-requests`, `/backoffice/installations/[installationId]`

```ts
type ApproveInstallationAssignmentInput = {
  assignmentId: string;
};

type ApproveInstallationAssignmentResult =
  | {
      ok: true;
      assignmentId: string;
      status: "WAITING_INSTALLER_RESPONSE";
      activeAttempt: ActiveAssignmentAttemptSnapshot;
    }
  | AdminActionFailure;
```

`WAITING_ADMIN_REVIEW` 상태의 활성 배정 시도만 승인할 수 있다. 승인 성공 시 기사 배정 요청 SMS를 생성하고 설치 예약은 `WAITING_INSTALLER_RESPONSE`로 전환한다.

### `switchToManualRequiredAction`

호출 위치: `/backoffice/installations`, `/backoffice/installations/[installationId]`

```ts
type SwitchToManualRequiredInput = {
  installationId: string;
  reason: string;
};

type SwitchToManualRequiredResult = { ok: true; status: "ATTENTION_REQUIRED" } | AdminActionFailure;
```

`READY_FOR_CANDIDATE_SELECTION`, `WAITING_ADMIN_REVIEW`, `WAITING_INSTALLER_RESPONSE` 상태에서 허용한다. 활성 자동 배정 시도가 있으면 `ADMIN_MANUAL_OVERRIDDEN`으로 종료하고, 주문 상태 값은 유지한 채 `hasOpenIssue=true`로 수동 처리 필요를 표시하며 관리자 ID, 전환 시각, 사유를 감사 이력에 기록한다.

### `cancelInstallationOrderAction`

호출 위치: `/backoffice/installations/[installationId]`

```ts
type CancelInstallationOrderInput = {
  installationId: string;
  reason: string;
};

type CancelInstallationOrderResult = { ok: true; status: "CANCELLED" } | AdminActionFailure;
```

`COMPLETED`, `CANCELLED`가 아닌 설치건만 취소할 수 있다. 취소 시 고객과 설치 기사에게 자동 SMS를 발송하지 않는다.

### `completeInstallationOrderAction`

호출 위치: `/backoffice/installations`, `/backoffice/installations/[installationId]`

```ts
type CompleteInstallationOrderInput = {
  installationId: string;
  reason: string;
};

type CompleteInstallationOrderResult = { ok: true; status: "COMPLETED" } | AdminActionFailure;
```

관리자는 슈퍼 권한으로 현재 상태와 관계없이 완료 처리할 수 있다. 활성 배정 시도가 있으면 `ADMIN_COMPLETED`로 종료하고 완료 처리 관리자 ID, 완료 시각, 완료 사유를 감사 이력에 기록한다.

### `retrySmsNotificationAction`

호출 위치: `/backoffice/installations/[installationId]`

```ts
type RetrySmsNotificationInput = {
  notificationId: string;
};

type RetrySmsNotificationResult =
  | { ok: true; notificationId: string; status: "SENT" | "PENDING" }
  | AdminActionFailure;
```

배정 요청 SMS는 배정 시도 ID 기준으로, 비배정 SMS는 발송 대상 + 업무 이벤트 기준으로 멱등하게 재시도한다.

## 6. 관리자 조회 shape

### 설치건 목록 item

```ts
type InstallationOrderListItem = {
  installationId: string;
  erpOrderNo: string;
  customerName: string;
  phone: string;
  sourceAddress: string | null;
  sourceItemsJsonText: string | null;
  productSummary: string;
  sourceOrderDate: string;
  status: InstallationReservationStatus;
  hasOpenIssue: boolean;
  statusChangedAt: string; // ISO datetime
  activeAttempt: {
    id: string;
    installerId: string;
    assignmentType: AssignmentAttemptType;
    assignmentStatus: AssignmentAttemptStatus;
    createdAt: string;
  } | null;
  customerRequest: {
    id: string;
    installAddress: string;
    installDate: string;
    customerPhone: string;
    fallbackUsed: boolean;
  } | null;
};
```

### 설치건 상세 item

```ts
type InstallationOrderDetailItem = InstallationOrderListItem & {
  sourceMemo: string | null;
  sourceItemsJsonText: string | null;
  requiredCapabilities: string[];
  requiredAqaraAppCapability: string | null;
  candidateRuns: Array<{
    id: string;
    reasonCode: CandidateRunReasonCode | null;
    createdAt: string;
    candidates: Array<{
      installerId: string;
      rank: number | null;
      isAutoRequestCandidate: boolean;
      regionTier: "EXACT_DISTRICT" | "REGION_ONLY" | "NOT_MATCHED" | null;
      monthlyDispatchCount: number;
      lastRequestedAt: string | null;
      excludedReason: CandidateExcludedReason | null;
      decisionReason: string;
    }>;
  }>;
  assignmentAttempts: Array<{
    id: string;
    installerId: string;
    assignmentType: AssignmentAttemptType;
    assignmentStatus: AssignmentAttemptStatus;
    acceptedAt: string | null;
    rejectedAt: string | null;
    timedOutAt: string | null;
    createdAt: string;
  }>;
  issues: Array<{
    id: string;
    code: InstallationIssueCode;
    status: "OPEN" | "RESOLVED";
    createdAt: string;
  }>;
  smsNotifications: Array<{
    id: string;
    businessEvent:
      | "CUSTOMER_INPUT_LINK"
      | "CUSTOMER_INPUT_REMINDER"
      | "INSTALLER_ASSIGNMENT_REQUEST"
      | "CUSTOMER_ASSIGNMENT_CONFIRMED"
      | "INSTALLER_HAPPYCALL_GUIDE";
    recipientType: "CUSTOMER" | "INSTALLER";
    recipientId: string | null;
    assignmentId: string | null;
    status: "PENDING" | "SENT" | "FAILED";
    retryable: boolean;
    failureReason: string | null;
    sentAt: string | null;
    createdAt: string;
  }>;
  auditEvents: Array<{
    id: string;
    eventType: string;
    actorType: "SYSTEM" | "CUSTOMER" | "INSTALLER" | "ADMIN";
    actorId: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }>;
};
```

`sourceMemo`는 관리자/기사 표시용 제품 요약이다. 배정 조건은 `sourceItemsJsonText`에서 산정되어 저장된 `requiredCapabilities`와 `requiredAqaraAppCapability`를 사용하며, 조회/배정 API는 `sourceMemo`를 재해석하지 않는다.

## 7. Cron API endpoints

### `GET /api/internal/cron/installation/sync-orders`

Headers:

```http
Authorization: Bearer <CRON_SECRET>
```

Success:

```json
{
  "ok": true,
  "job": "installation/sync-orders",
  "fetchedCount": 10,
  "savedCount": 3
}
```

Failure:

```json
{ "ok": false, "job": "installation/sync-orders", "error": "ERP_DATA_SYNC_FAILED" }
```

`401 Unauthorized`는 body 없이 문자열 `Unauthorized`를 반환할 수 있다.

### `GET /api/internal/cron/installation/dispatcher`

Headers:

```http
Authorization: Bearer <CRON_SECRET>
```

Success:

```ts
type DispatcherResponse = {
  ok: true;
  job: "installation/dispatcher";
  results: {
    processInstallationOrders: unknown;
    remindCustomerRequests: unknown;
    fallbackCustomerRequests: unknown;
    dispatchReadyOrders: unknown;
    timeoutInstallerAssignments: unknown;
    alertDueSoonOrders: unknown;
    sendInstallationNotifications: unknown;
  };
};
```

Failure:

```json
{ "ok": false, "job": "installation/dispatcher", "error": "INTERNAL_DISPATCHER_FAILED" }
```

## 8. SMS 발송 정책

SMS 발송은 공용 internal SMS API를 호출하지 않는다. 발송이 필요한 기능 코드에서 해당 업무 이벤트에 맞는 발송 함수 또는 outbox 유틸을 만들어 직접 발송한다.

SMS 발송 실패는 최초 발송 포함 최대 3회까지, SMS 도달 실패는 최초 발송 포함 최대 2회까지 같은 업무 대상 기준으로 재시도한다. 배정 요청 SMS 최종 실패는 상태 전이를 막고 배정 시도 실패 정책을 따른다. 비배정 SMS 최종 실패는 업무 상태 전이를 rollback하지 않고 `SMS_FAILED` 예외로 관리한다.
