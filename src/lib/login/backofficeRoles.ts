// 백오피스 유저 등급. 숫자가 작을수록 권한이 크다(0 은 예외: 승인 대기).
//
//   0  승인 대기   회원가입만 하고 아직 승인 전. 백오피스에 들어올 수 없다.
//   1  최고 관리자 모든 권한 (설정·유저 관리 포함)
//   2  관리자     설정을 제외한 모든 화면을 보고 수정한다
//   3  사용자     설정을 제외한 모든 화면을 보기만 한다 (수정·문자 발송 불가, 엑셀은 가능)
//
// 예전에는 "level >= 1 이면 전부 허용" 이었다. 그 비교를 그대로 두면 3 이 1 보다
// 권한이 커지므로, 등급 비교는 반드시 아래 함수로만 한다.

export const BACKOFFICE_LEVEL = {
  PENDING: 0,
  SUPER_ADMIN: 1,
  ADMIN: 2,
  VIEWER: 3,
} as const;

export const ASSIGNABLE_BACKOFFICE_LEVELS = [
  BACKOFFICE_LEVEL.SUPER_ADMIN,
  BACKOFFICE_LEVEL.ADMIN,
  BACKOFFICE_LEVEL.VIEWER,
] as const;

// 조회 전용 계정이 수정을 시도했을 때 돌려주는 에러. 대부분 화면이 에러 값을 그대로
// 보여 주므로 코드 대신 안내 문구 자체를 쓴다.
export const BACKOFFICE_READ_ONLY_ERROR = "조회 전용 계정은 수정할 수 없습니다.";

// view: 백오피스 화면을 볼 수 있다 / edit: 데이터를 바꾸거나 문자를 보낼 수 있다 /
// settings: 설정 메뉴(유저 관리 포함)를 쓸 수 있다
export type BackofficeAccess = "view" | "edit" | "settings";

export function isAssignableBackofficeLevel(level: number) {
  return (ASSIGNABLE_BACKOFFICE_LEVELS as readonly number[]).includes(level);
}

export function hasBackofficeAccess(level: number, access: BackofficeAccess) {
  switch (access) {
    case "view":
      return isAssignableBackofficeLevel(level);
    case "edit":
      return level === BACKOFFICE_LEVEL.SUPER_ADMIN || level === BACKOFFICE_LEVEL.ADMIN;
    case "settings":
      return level === BACKOFFICE_LEVEL.SUPER_ADMIN;
  }
}

export function canViewBackoffice(level: number) {
  return hasBackofficeAccess(level, "view");
}

export function canEditBackoffice(level: number) {
  return hasBackofficeAccess(level, "edit");
}

export function canManageBackofficeSettings(level: number) {
  return hasBackofficeAccess(level, "settings");
}

export function formatBackofficeLevel(level: number) {
  switch (level) {
    case BACKOFFICE_LEVEL.PENDING:
      return "승인 대기";
    case BACKOFFICE_LEVEL.SUPER_ADMIN:
      return "최고 관리자";
    case BACKOFFICE_LEVEL.ADMIN:
      return "관리자";
    case BACKOFFICE_LEVEL.VIEWER:
      return "사용자(조회)";
    default:
      return `알 수 없음(${level})`;
  }
}
