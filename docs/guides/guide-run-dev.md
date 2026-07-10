# warranty-h5 실행 가이드

이 문서는 `warranty-h5` 프로젝트를 로컬에서 설치하고 실행하는 절차를 정리합니다.
별도 표기가 없는 한 모든 명령은 `warranty-h5` 프로젝트 root에서 실행합니다.

## 사전 준비

### Node.js

로컬 개발은 Node 20.19.x 사용을 권장합니다. `package.json`의 엔진 범위는 Node 20을 기준으로 하지만, 현재 lockfile의 주요 의존성은 Node 20.19 이상을 요구합니다.

```bash
node >=20.19 <21
```

일부 의존성은 더 높은 Node 버전을 요구할 수 있습니다. 예를 들어 `@zxing/library@0.22.0`은 설치 시 Node `>=24` 엔진 경고를 낼 수 있습니다. 엔진 경고가 발생해도 설치가 계속될 수 있으나, 가능하면 Node 20.19.x에서 먼저 확인합니다.

### Supabase 정보

DB 기능을 실행하려면 Supabase 프로젝트의 연결 정보가 필요합니다.

- Supabase transaction pooler URL
- Supabase direct/session URL
- Supabase URL
- Supabase anon key
- Supabase service role key

## 1. 환경변수 설정

예시 파일을 복사해 로컬 환경변수 파일을 만듭니다.

```bash
cp .env.example .env
```

`.env`에 값을 채웁니다.

## 2. 의존성 설치

의존성을 설치합니다.

```bash
npm install
```

설치 중 `postinstall` 단계에서 `prisma generate`가 실행됩니다. 이때 `DIRECT_URL` 환경변수가 없으면 Prisma 설정 로딩이 실패할 수 있으므로, 가능하면 환경변수를 먼저 준비한 뒤 설치합니다.

## 3. 개발 서버 실행

일반 로컬 환경에서는 다음 명령을 사용합니다.

```bash
npm run dev
```

접속 주소는 기본적으로 아래와 같습니다.

```text
http://localhost:3000
```

## 4. 운영 빌드 확인

빌드가 정상인지 확인합니다.

```bash
npm run build
```

빌드 결과를 실행합니다.

```bash
npm run start
```
