# 알고리즘 테스트 커버리지 확인 가이드

## 목적

이 문서는 설치 기사 자동 배정 알고리즘 영역의 테스트 커버리지를 확인하는 방법과 결과 표의 의미를 설명한다.

현재 커버리지 기준은 전체 애플리케이션이 아니라 알고리즘 관련 파일에만 적용한다.

## 실행 방법

```bash
npm run test:algorithm
```

이 명령은 다음 작업을 수행한다.

1. 알고리즘 관련 테스트만 실행한다.
2. 알고리즘 관련 소스 파일만 커버리지 대상으로 측정한다.
3. 커버리지 기준을 만족하지 못하면 실패 exit code로 종료한다.

CI에서 이 명령을 실행하면 기준 미달 시 빌드를 실패시킬 수 있다.

## 측정 대상

설정 파일은 `vitest.algorithm.config.ts`이다.

현재 커버리지 측정 대상은 다음 파일이다.

- `src/lib/installation/installer/matcher.ts`
- `src/lib/installation/installer/source.ts`
- `src/lib/installation/orders/source/source-items.ts`
- `src/lib/installation/installer/dispatch.ts`

테스트 실행 대상은 다음 파일이다.

- `src/lib/installation/installer/matcher.test.ts`
- `src/lib/installation/installer/source.test.ts`
- `src/lib/installation/orders/source/source-items.test.ts`
- `src/lib/installation/installer/dispatch.test.ts`

## 통과 기준

현재 기준은 네 항목 모두 75% 이상이다.

- Statements: 75%
- Branches: 75%
- Functions: 75%
- Lines: 75%

하나라도 기준보다 낮으면 `npm run test:algorithm`은 실패한다.

## 결과 표 읽는 법

실행하면 다음과 같은 표가 출력된다.

```text
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
All files          |   90.38 |    77.56 |   94.36 |   92.01 |
```

최종 판단은 `All files` 행을 보면 된다.

### Statements

전체 실행문 중 테스트 중 실제로 실행된 실행문의 비율이다.

예를 들어 변수 할당, 함수 호출, return 문 등이 여기에 포함된다.

### Branches

조건 분기 중 테스트 중 실제로 지나간 분기의 비율이다.

예를 들어 다음 코드에는 두 개의 주요 분기가 있다.

```ts
if (candidate.matchTier === "EXACT_DISTRICT") {
  return 2;
}

return 1;
```

`EXACT_DISTRICT` 케이스만 테스트하면 한쪽 분기만 커버된다. `REGION_ONLY` 같은 반대 케이스도 테스트해야 분기 커버리지가 올라간다.

분기 커버리지는 `if`, 삼항 연산자, `||`, `&&`, nullish fallback, optional chaining 등 조건 조합이 많을수록 낮게 나오기 쉽다.

### Functions

전체 함수 중 테스트 중 호출된 함수의 비율이다.

함수가 호출되기만 하면 커버된 것으로 잡히므로, 함수 내부의 모든 조건이 검증됐다는 뜻은 아니다. 내부 조건 검증은 주로 Branches와 Lines를 같이 봐야 한다.

### Lines

전체 코드 라인 중 테스트 중 실행된 라인의 비율이다.

실무에서는 Statements와 비슷하게 움직이는 경우가 많지만, 리포터와 코드 형태에 따라 수치가 다를 수 있다.

### Uncovered Line #s

테스트 중 실행되지 않은 라인 번호다.

예를 들어 다음처럼 나오면:

```text
matcher.ts | 86.66 | 78.2 | 93.54 | 91.66 | 70,79-84,132
```

`matcher.ts`에서 70번, 79-84번, 132번 라인이 아직 테스트 중 실행되지 않았다는 뜻이다. 커버리지를 더 올릴 때는 이 라인들이 어떤 조건에서 실행되는지 확인하고 해당 경계 케이스를 테스트로 추가한다.

## 현재 기준 해석

최근 확인 결과는 다음 수준이다.

```text
Statements : 90.38%
Branches   : 77.56%
Functions  : 94.36%
Lines      : 92.01%
```

가장 낮은 항목은 Branches다. 그래도 현재 75% 기준을 넘기므로 통과한다.

Branches는 조건 조합이 늘어나면 가장 먼저 떨어지는 지표다. 자동 배정 정책에 조건이 추가되면 `matcher.test.ts`, `source.test.ts`, `dispatch.test.ts`에 반대 케이스와 예외 케이스를 같이 추가해야 한다.

## 산출물 정책

현재 설정은 터미널에 텍스트 리포트만 출력한다.

`coverage/` HTML 리포트나 `lcov.info` 파일은 생성하지 않는다. 커버리지 결과는 `npm run test:algorithm` 실행 결과의 표에서 확인한다.
