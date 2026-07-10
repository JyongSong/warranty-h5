# 페이지 구현 흐름

> 목적: 페이지별 서버/클라이언트 함수 호출 순서를 기능 흐름 파악용으로 기록한다.
> 관련 문서: `docs/plans/spec-pages.md`

## 작성 기준

1. 이 문서는 화면 기능을 이해하는 데 필요한 앱 코드 호출 순서를 다룬다.
2. 테이블 라이브러리의 내부 렌더링 호출은 기록하지 않는다.
3. 각 페이지는 기본 호출 순서만 기록한다.

## 1. 관리자 ERP 주문 데이터 페이지

대상 경로: `/backoffice/installation-order-source`

### 1-1. 기본 호출 순서

아래 순서는 ERP 조회와 검증 주석 처리가 모두 성공한 경우의 호출 순서다. 조회/정규화 실패 시 현재까지 생성된 `orders`와 `errorMessage`를 화면에 전달한다.

1-1-1. 서버 페이지 진입
1-1-1-1. `InstallationOrderSourcePage({ searchParams })`
1-1-1-2. `await searchParams`
1-1-1-3. `requireBackofficeUserPage("/backoffice/installation-order-source", 1)`

1-1-2. ERP 주문 데이터 조회
1-1-2-1. `fetchResolvedInstallationOrdersFromErp()`
1-1-2-1-1. `fetchRawInstallationOrderRowsFromErp()`
1-1-2-1-1-1. `getTodayKstOrderDate()`
1-1-2-1-1-2. `fetchErpInstallationOrderRows(today)`
1-1-2-1-1-2-1. `getErpInstallationOrdersPool()`
1-1-2-1-1-2-2. `pool.request().input("today", today).query(...)`

1-1-3. ERP rows를 표시 모델로 전달
1-1-3-1. `mapErpRowsToFetchedInstallationOrders(rows)`
1-1-3-1-1. ERP 조회 payload의 `items_json` 문자열을 그대로 유지한다.
1-1-3-1-2. `item_code`, `item_name`, `quantity`, `items` 파생 필드는 생성하지 않는다.

1-1-4. 원천 데이터 검증 주석 처리
1-1-4-1. `orders.map(annotateFetchedInstallationOrderValidation)`
1-1-4-1-1. `annotateFetchedInstallationOrderValidation(order)`

1-1-5. 오류 처리
1-1-5-1. `catch (error)`
1-1-5-2. `errorMessage = error instanceof Error ? error.message : "UNKNOWN_ERROR"`

1-1-6. ERP 주문 데이터 화면 전달
1-1-6-1. `InstallationOrderSourceTable({ initialItems: orders, errorMessage })`
1-1-6-2. 클라이언트에서 컬럼 표시 상태와 정렬 상태를 초기화한다.
1-1-6-3. 테이블 헤더, 행, 컬럼 선택 UI를 렌더링한다.

## 2. 관리자 설치 주문 페이지

대상 경로: `/backoffice/installations`

### 2-1. 기본 호출 순서

아래 순서는 `view`가 없거나 `view=orders`인 설치 주문 목록 탭의 호출 순서다.

2-1-1. 서버 페이지 진입
2-1-1-1. `InstallationOrdersPage({ searchParams })`
2-1-1-2. `await searchParams`
2-1-1-3. `resolvedSearchParams.lazy === "true"`이면 `sleep(5_000)`
2-1-1-4. `view = resolvedSearchParams.view === "assignment-requests" ? "assignment-requests" : "orders"`
2-1-1-5. `query = getSingleSearchParam(resolvedSearchParams.q)`
2-1-1-6. `tableParams = normalizeBackofficeTableParams(resolvedSearchParams)`
2-1-1-7. `nextPath = buildBackofficeNextPath("/backoffice/installations", resolvedSearchParams)`

2-1-2. 탭 렌더링
2-1-2-1. `InstallationManagementTabs({ activeView: view })`
2-1-2-1-1. `buildInstallationsTabHref({})`
2-1-2-1-2. `buildInstallationsTabHref({ view: "assignment-requests" })`
2-1-2-1-3. `Link({ href: tab.href })`

2-1-3. 설치 주문 목록 뷰 진입
2-1-3-1. `InstallationOrderListView({ nextPath, query, searchParams, tableParams })`
2-1-3-2. `requireBackofficeUserPage(nextPath, 1)`

2-1-4. 설치 주문 상태 데이터 조회
2-1-4-1. `Promise.all([listInstallationOrderStatuses(...), countInstallationOrderStatuses(...)])`
2-1-4-1-1. `listInstallationOrderStatuses({ query, limit: tableParams.pageSize, offset: tableParams.skip })`
2-1-4-1-2. `countInstallationOrderStatuses({ query })`
2-1-4-2. `listInstallationOrderStatuses`, `countInstallationOrderStatuses` 내부 검색 조건 생성
2-1-4-2-1. `buildExactPiiSearchWhere(query)`
2-1-4-2-1-1. 전화번호 검색이면 `normalizePhone11(trimmed)` 후 `hmacPii(...)`
2-1-4-2-1-2. 고객명 검색이면 `normalizeNameForHash(trimmed)` 후 `hmacPii(...)`
2-1-4-3. `prisma.installationOrder.findMany(...)`
2-1-4-4. `prisma.installationOrder.count(...)`
2-1-4-5. 주문과 고객 요청 PII를 `decryptNullablePii(...)`로 복호화한다.

2-1-5. 설치 주문 목록 표시 모델 조립
2-1-5-1. `orders.map((order) => ...)`
2-1-5-1-1. `request = order.customerRequests[0] ?? null`
2-1-5-1-2. `assignment = order.assignmentAttempts[0] ?? null`
2-1-5-1-3. `InstallationOrderListItem` 생성
2-1-5-2. `totalPages = getPageCount(totalItems, tableParams.pageSize)`
2-1-5-3. `buildPaginationModel("/backoffice/installations", searchParams, tableParams, totalItems, totalPages)`

2-1-6. 설치 주문 목록 화면 전달
2-1-6-1. `InstallationOrderList({ initialItems: items, searchQuery: query, pagination })`
2-1-6-2. 클라이언트에서 정렬 상태, 컬럼 표시 상태, 상세 링크, 검색 초기화 링크를 준비한다.
2-1-6-3. 검색 폼, 컬럼 선택, 테이블, 상태별 행 강조를 렌더링한다.
2-1-6-4. 페이지네이션 정보가 있으면 페이지 크기, 이전, 다음 링크를 렌더링한다.

### 2-2. 배정 요청 탭 기본 호출 순서

아래 순서는 `view=assignment-requests`인 배정 요청 탭의 호출 순서다.

2-2-1. 서버 페이지 진입
2-2-1-1. 기본 호출 순서 `2-1-1`부터 `2-1-2`까지 동일하게 실행한다.

2-2-2. 배정 요청 목록 뷰 진입
2-2-2-1. `AssignmentReviewsView({ nextPath })`
2-2-2-2. `requireBackofficeUserPage(nextPath, 1)`

2-2-3. 배정 요청 데이터 조회
2-2-3-1. `listActiveInstallerRequestAssignments()`
2-2-3-1-1. `prisma.installationInstallerAssignmentAttempt.findMany(...)`
2-2-3-1-2. `listReviewInstallersById(installerIds)`
2-2-3-1-3. 주문 원천, 고객 요청, 후보 기사 PII를 복호화한다.

2-2-4. 배정 요청 표시 모델 조립
2-2-4-1. `assignments.map((assignment) => ...)`
2-2-4-1-1. 주문 정보, 고객 요청, 후보 기사, 현재 배정 상태를 합쳐 `AssignmentReviewItem`을 생성한다.

2-2-5. 배정 요청 목록 화면 전달
2-2-5-1. `AssignmentReviewList({ initialItems: items })`
2-2-5-2. 클라이언트에서 검색어 상태와 정렬 상태를 초기화한다.
2-2-5-3. 검색어가 있으면 주문번호, 고객명, 전화번호, 설치주소, 기사명, 기사 전화번호 기준으로 목록을 필터링한다.
2-2-5-4. 검색 폼, 컬럼 선택, 테이블을 렌더링한다.

## 3. 관리자 설치건 상세 페이지

대상 경로: `/backoffice/installations/[id]`

### 3-1. 기본 호출 순서

3-1-1. 서버 페이지 진입
3-1-1-1. `InstallationOrderDetailPage({ params, searchParams })`
3-1-1-2. `await params`
3-1-1-3. `await searchParams`
3-1-1-4. `installationId = resolvedParams.installationId`
3-1-1-5. `nextPath = buildBackofficeNextPath(\`/backoffice/installations/${installationId}\`, resolvedSearchParams)`
3-1-1-6. `requireBackofficeUserPage(nextPath, 1)`

3-1-2. 설치건 상세 데이터 조회
3-1-2-1. `getInstallationOrderStatusDetail(installationId)`
3-1-2-1-1. `prisma.installationOrder.findUnique(...)`
3-1-2-1-2. 주문 원천, 고객 요청, 배정 시도, 후보 기사 PII를 복호화한다.
3-1-2-2. 조회 결과가 없으면 `notFound()`를 호출한다.

3-1-3. 설치건 상세 표시 모델 조립
3-1-3-1. `parseRequiredCapabilitiesText(order.requiredCapabilities)`
3-1-3-2. 활성 고객 요청을 결정한다.
3-1-3-3. 활성 고객 요청의 설치 주소가 있으면 후보 기사 목록을 계산한다.
3-1-3-3-1. `listDispatchCandidateInstallers({ requiredCapabilities, requiredAqaraAppCapability })`
3-1-3-3-2. `findBestMatchingInstallers(activeRequest.installAddress, installers)`
3-1-3-3-3. `toInstallerCandidateItem(candidate, rank)`
3-1-3-4. 후보 실행 이력, 상태 이벤트, 이슈, SMS 알림을 화면 표시 형태로 변환한다.
3-1-3-5. `InstallationOrderDetailItem` 생성

3-1-4. 설치건 상세 화면 전달
3-1-4-1. `InstallationOrderDetail({ item })`
3-1-4-2. 클라이언트에서 활성 탭 상태와 액션 진행 상태를 초기화한다.
3-1-4-3. 주문 상태, 주문 정보, 고객 요청, 배정, SMS, 이슈, 타임라인 탭을 렌더링한다.
3-1-4-4. 액션 버튼을 현재 상태에 맞게 렌더링한다.

## 4. 관리자 기사 리스트 페이지

대상 경로: `/backoffice/installers`

### 4-1. 기본 호출 순서

4-1-1. 서버 페이지 진입
4-1-1-1. `BackofficeInstallersPage({ searchParams })`
4-1-1-2. `await searchParams`
4-1-1-3. `normalizeBackofficeTableParams(resolvedSearchParams)`
4-1-1-4. `requireBackofficeUserPage("/backoffice/installers", 1)`

4-1-2. 기사 데이터 조회
4-1-2-1. `import("@/lib/prisma")`
4-1-2-2. `Promise.all([prisma.installer.findMany(...), prisma.installer.count()])`
4-1-2-2-1. `findMany`는 활성 여부, 권역, 지점, 이름 순으로 정렬한다.
4-1-2-2-2. `findMany`는 `tableParams.skip`, `tableParams.pageSize`로 페이지 범위를 제한한다.

4-1-3. 기사 목록 표시 모델 조립
4-1-3-1. `installers.map((installer) => ...)`
4-1-3-2. 날짜 필드는 ISO 문자열로 변환한다.
4-1-3-3. `getPageCount(totalItems, tableParams.pageSize)`
4-1-3-4. `buildBackofficeTableHref(...)`로 페이지 크기, 이전, 다음 링크를 생성한다.

4-1-4. 기사 목록 화면 전달
4-1-4-1. `InstallerListTable({ initialItems: items, pagination })`
4-1-4-2. 클라이언트에서 정렬 상태, 컬럼 표시 상태, 컬럼 크기, 컬럼 순서를 초기화한다.
4-1-4-3. 활성 기사 수를 계산해 요약 영역에 표시한다.
4-1-4-4. 컬럼 선택, 정렬, 컬럼 순서 변경, 컬럼 크기 조정 UI를 렌더링한다.
4-1-4-5. 페이지네이션 정보가 있으면 `BackofficeTablePagination(...)`을 렌더링한다.

## 5. 고객 설치 예약 입력 페이지

대상 경로: `/i/c/[token]`

### 5-1. 토큰 조회 및 화면 렌더링

아래 순서는 고객 예약 입력 페이지에 진입해 토큰을 조회하고 초기 화면을 렌더링하는 호출 순서다. 토큰이 없거나 조회 결과가 없으면 오류 메시지를 화면에 전달한다.

5-1-1. 서버 페이지 진입
5-1-1-1. `InstallationCustomerTokenPage({ params })`
5-1-1-2. `await params`
5-1-1-3. `token = resolvedParams.token`
5-1-1-4. `getInitialState(token)`

5-1-2. 고객 요청 토큰 조회
5-1-2-1. `getInstallationCustomerRequestByToken(token)`
5-1-2-1-1. `hashInstallationCustomerToken(token.trim())`
5-1-2-1-2. `prisma.installationCustomerRequest.findUnique(...)`
5-1-2-1-3. `getCustomerRequestTokenStatus(request, now)`
5-1-2-1-4. `decryptCustomerRequest(request)`

5-1-3. 고객 예약 입력 화면 전달
5-1-3-1. `todayKST()`
5-1-3-2. `CustomerRequestClient({ token, initialInfo, initialError, initialAccessBlocked, initialToday, privacyPolicy })`
5-1-3-3. 클라이언트에서 최소/최대 설치 희망일, 주소, 날짜, 시간대, 연락처, 요청사항, 동의 상태를 초기화한다.
5-1-3-4. 토큰 없음, 미조회, 만료, 취소, 제출 완료 재접근 상태면 `이미 접수되었거나 유효하지 않은 정보` 상태 화면을 렌더링한다.
5-1-3-5. 유효 상태면 Daum 우편번호 스크립트, 주문 정보, 주소 입력, 날짜 입력, 연락처 입력, 개인정보 동의, 제출 확인 모달을 렌더링한다.
5-1-3-6. 고객 표시 단계는 `입력`, `입력 완료`, `이미 접수되었거나 유효하지 않은 정보`, `오류` 네 가지로 제한한다.

### 5-2. 고객 예약 제출 액션 호출 순서

아래 순서는 고객이 입력 폼을 제출한 뒤 실행되는 서버 액션과 도메인 처리 호출 순서다.

5-2-1. 클라이언트 제출 확인
5-2-1-1. `confirmSubmit()`
5-2-1-2. `submitCustomerRequestAction({ token, zonecode, address, addressDetail, installDate, installTimeSlot, customerPhone, customerNote })`

5-2-2. 서버 액션 입력 조립
5-2-2-1. `getBaseInstallAddress(input)`
5-2-2-2. `getCustomerNote(input)`
5-2-2-3. `submitInstallationCustomerRequest(token, normalizedInput)`

5-2-3. 고객 예약 저장
5-2-3-1. `normalizeCustomerRequestSubmitInput(input, now)`
5-2-3-1-1. `parseInstallationAddress(installAddress)`
5-2-3-1-2. `splitInstallationSourceAddress(installAddress)`
5-2-3-1-3. `normalizePhone11(input.customerPhone)`
5-2-3-1-4. `validateInstallDateRange(installDate, now)`
5-2-3-2. `prisma.$transaction(async (tx) => ...)`
5-2-3-2-1. `tx.installationCustomerRequest.findUnique(...)`
5-2-3-2-2. `getCustomerRequestTokenStatus(request, now)`
5-2-3-2-3. `tx.installationCustomerRequest.update(...)`
5-2-3-2-4. `transitionInstallationOrderStatus(...READY_FOR_CANDIDATE_SELECTION...)`

5-2-4. 자동 배정 트리거와 제출 결과 반영
5-2-4-1. `isInstallDateWithinDispatchWindow(normalized.installDate, now)`
5-2-4-2. 조건을 만족하면 `dispatchReadyInstallationOrders({ now, limit: 1, orderId, baseUrl: getBaseUrl() })`
5-2-4-3. 액션 성공 결과를 받으면 `submitted`를 `true`로 변경하고 `입력 완료` 화면을 렌더링한다.
5-2-4-4. 액션 실패가 토큰 없음, 미조회, 만료, 이미 제출, 취소 등 절차 밖 상태이면 시스템 오류로 표시하지 않고 `이미 접수되었거나 유효하지 않은 정보` 화면을 렌더링한다.

## 6. 설치 기사 배정 확인 페이지

대상 경로: `/i/i/[token]`

### 6-1. 토큰 조회 및 화면 렌더링

아래 순서는 기사 배정 확인 페이지에 진입해 토큰을 조회하고 초기 화면을 렌더링하는 호출 순서다. 토큰이 없거나 조회 결과가 없으면 오류가 아니라 접근 불가 상태를 화면에 전달한다.

6-1-1. 서버 페이지 진입
6-1-1-1. `InstallationInstallerTokenPage({ params })`
6-1-1-2. `await params`
6-1-1-3. `token = resolvedParams.token`
6-1-1-4. `getInitialState(token)`

6-1-2. 기사 배정 토큰 조회
6-1-2-1. `getInstallerAssignmentByToken(token)`
6-1-2-1-1. `hashInstallerToken(token.trim())`
6-1-2-1-2. `prisma.installationInstallerAssignmentAttempt.findUnique(...)`
6-1-2-1-3. `decryptAssignmentPii(assignment)`
6-1-2-1-4. `getInstallerAssignmentTokenStatus(typedAssignment, now)`
6-1-2-1-5. `toInstallerVisibleAssignment(typedAssignment)`

6-1-3. 기사 응답 화면 전달
6-1-3-1. `InstallerResponseClient({ token, initialInfo, initialError, initialAccessBlocked, responseConfig })`
6-1-3-2. 클라이언트에서 `buildDispatchDetail(initialInfo, responseConfig)`를 호출한다.
6-1-3-2-1. `getInitialStatus(initialInfo)`
6-1-3-2-2. `formatInstallAddress(request)`
6-1-3-3. 응답 상태, 거절 사유, 직접 입력 사유, 확인 모달, 제출 상태를 초기화한다.
6-1-3-4. 유효 상태면 상태 헤더, 배정 상세, 수락/거절 영역, 확인 모달을 렌더링한다.
6-1-3-5. 토큰 없음, 미조회, 만료, 취소, 이미 응답된 재접근 상태면 `이미 응답했거나 유효하지 않은 정보` 상태 화면을 렌더링한다.
6-1-3-6. 기사 표시 단계는 `응답`, `응답 완료`, `이미 응답했거나 유효하지 않은 정보`, `오류` 네 가지로 제한한다.

### 6-2. 기사 응답 제출 액션 호출 순서

아래 순서는 기사가 수락 또는 거절을 제출한 뒤 실행되는 서버 액션과 도메인 처리 호출 순서다.

6-2-1. 클라이언트 응답 확인
6-2-1-1. `confirmPendingAction()`
6-2-1-2. `submitInstallerResponseAction({ token, response, rejectReason })`
6-2-1-3. `respondInstallerAssignment(token, { response, rejectReason })`

6-2-2. 기사 응답 검증
6-2-2-1. `prisma.$transaction(async (tx) => ...)`
6-2-2-1-1. `tx.installationInstallerAssignmentAttempt.findUnique(...)`
6-2-2-1-2. `decryptAssignmentPii(assignment)`
6-2-2-1-3. `getInstallerAssignmentTokenStatus(typedAssignment, now)`
6-2-2-1-4. 설치건 상태가 `WAITING_INSTALLER_RESPONSE`인지 확인한다.
6-2-2-1-5. 현재 배정이 설치건의 `activeAssignmentId`와 일치하는지 확인한다.

6-2-3. 기사 수락 처리
6-2-3-1. 응답이 `ACCEPT`이면 `acceptAssignment(tx, typedAssignment, now)`
6-2-3-1-1. `tx.installationInstallerAssignmentAttempt.update({ status: "INSTALLER_ACCEPTED", acceptedAt: now })`
6-2-3-1-2. 고객 배정 확정 SMS 알림을 `tx.installationNotification.upsert(...)`로 예약한다.
6-2-3-1-3. `getInstallerContact(assignment.installerId, tx)`
6-2-3-1-4. 기사 해피콜 안내 SMS 알림을 `tx.installationNotification.upsert(...)`로 예약한다.
6-2-3-1-5. `transitionInstallationOrderStatus(...INSTALLER_ASSIGNED...)`
6-2-3-2. 액션 성공 결과를 받으면 클라이언트 상태를 `accepted`로 변경한다.
6-2-3-3. 액션 실패가 토큰 없음, 미조회, 만료, 이미 응답, 취소, 비활성 배정 등 절차 밖 상태이면 시스템 오류로 표시하지 않고 `이미 응답했거나 유효하지 않은 정보` 화면을 렌더링한다.

6-2-4. 기사 거절 처리
6-2-4-1. 응답이 `REJECT`이면 `rejectAssignment(tx, typedAssignment, { rejectReason, now, baseUrl, tokenFactory })`
6-2-4-1-1. `tx.installationInstallerAssignmentAttempt.update({ status: "INSTALLER_REJECTED", rejectedAt: now, rejectReason })`
6-2-4-1-2. 수동 배정이면 상태 값을 바꾸지 않고 열린 예외로 수동 처리 필요를 표시한 뒤 종료한다.
6-2-4-1-3. 자동 배정이면 `listAttemptedAssignments(tx, installationOrderId)`를 호출한다.
6-2-4-1-4. 활성 배정이 있으면 `transitionInstallationOrderStatus(...WAITING_INSTALLER_RESPONSE...)`로 현재 배정 정보를 갱신한다.
6-2-4-1-5. 자동 배정 한도에 도달하면 `markAutoFallbackExhausted(...)`로 이슈를 만들고 수동 처리 상태로 전환한다.
6-2-4-1-6. 차순위 후보가 필요하면 `findNextInstallerCandidate(...)`를 호출한다.
6-2-4-1-6-1. `listDispatchCandidateInstallers(...)`
6-2-4-1-6-2. `findBestMatchingInstallers(address, candidates)`
6-2-4-1-7. 차순위 후보가 있으면 새 `installationInstallerAssignmentAttempt`와 기사 배정 요청 SMS 알림을 생성한다.
6-2-4-1-8. `transitionInstallationOrderStatus(...WAITING_INSTALLER_RESPONSE...)`로 새 활성 배정을 기록한다.
6-2-4-2. 액션 성공 결과를 받으면 클라이언트 상태를 `rejected`로 변경한다.
6-2-4-3. 액션 실패가 토큰 없음, 미조회, 만료, 이미 응답, 취소, 비활성 배정 등 절차 밖 상태이면 시스템 오류로 표시하지 않고 `이미 응답했거나 유효하지 않은 정보` 화면을 렌더링한다.
