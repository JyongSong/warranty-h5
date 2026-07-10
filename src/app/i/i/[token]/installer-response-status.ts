export type InstallerResponseStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "expired"
  | "completed"
  | "cancelled";

export type InstallerResponseTokenStatus =
  | "VALID"
  | "EXPIRED"
  | "RESPONDED"
  | "CANCELLED"
  | null;

export const INSTALLER_RESPONSE_UNAVAILABLE_STATUS = {
  mark: "!",
  title: "유효하지 않거나 이미 응답한 정보입니다",
  description: [
    "응답 링크를 다시 확인해 주세요. 이미 응답한 경우 추가 입력은 필요하지 않습니다. 응답 내용을 변경해야 하는 경우 고객센터로 문의해 주세요.",
  ],
  tone: "amber",
} as const;

export function getInitialInstallerResponseStatus({
  tokenStatus,
}: {
  tokenStatus: InstallerResponseTokenStatus;
}): InstallerResponseStatus {
  if (tokenStatus === "VALID") return "pending";
  if (tokenStatus === "EXPIRED") return "expired";
  if (tokenStatus === "CANCELLED") return "cancelled";
  return "completed";
}

export function isInstallerResponseUnavailableStatus(status: InstallerResponseStatus) {
  return status === "expired" || status === "completed" || status === "cancelled";
}

export function isInstallerResponseUnavailableError(error: string) {
  return [
    "MISSING_TOKEN",
    "TOKEN_NOT_FOUND",
    "TOKEN_EXPIRED",
    "ALREADY_RESPONDED",
    "ASSIGNMENT_CANCELLED",
    "ASSIGNMENT_NOT_WAITING_INSTALLER_RESPONSE",
  ].includes(error);
}
