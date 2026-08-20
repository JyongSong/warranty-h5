import { CONFIRM_TOKEN_TTL_HOURS } from "@/lib/confirmToken";
import { type AlimtalkRequest } from "@/lib/notifications/alimtalk";

/**
 * 인증기사에게 보내는 설치 확인 링크 안내.
 * 최초 등록(/api/register)과 백오피스 재발송(/api/resend) 두 곳에서 쓴다.
 */
export function buildInstallerConfirmSms(input: { confirmLink: string }) {
  const subject = "[Aqara]";
  const text = [
    "설치 확인이 필요합니다.",
    `${CONFIRM_TOKEN_TTL_HOURS}시간 이내에 아래 링크에서 설치 정보를 확인 후 보증기간이 적용됩니다.`,
    "",
    input.confirmLink,
    "",
    "※ 발신전용",
  ].join("\n");

  // 알림톡 템플릿 "설치정보 기사 확인 링크". 링크는 본문이 아니라 버튼에
  // 들어가고 버튼이 `https://#{confirmLink}` 로 등록돼 있어, 레지스트리의
  // linkVariables 가 값에서 프로토콜을 떼어낸다.
  const alimtalk: AlimtalkRequest = {
    templateKey: "installer_confirm_link",
    variables: { confirmLink: input.confirmLink },
  };

  return { subject, text, alimtalk };
}
