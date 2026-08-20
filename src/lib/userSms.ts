import { formatKrPhone } from "@/lib/phone";
import { type AlimtalkRequest } from "@/lib/notifications/alimtalk";

type InstallType = "self" | "external" | "installer";

const INSTALL_TYPE_LABEL: Record<InstallType, string> = {
  self: "자가 설치",
  external: "외부 기사 설치",
  installer: "본사 공인 기사 설치",
};

// 등록 완료 후 사용자에게 보내는 SMS 본문.
//   자가/외부 기사: register 직후
//   본사 공인 기사: 기사 confirm 직후 (installerPhone 포함)
export function buildUserCompletionSms(input: {
  installType: InstallType;
  freeAsEndDate: string;
  installerPhone: string | null;
}) {
  const subject = "[Aqara]";
  const lines = [
    "도어락 제품정보 등록이 완료되었습니다.",
    `설치 유형: ${INSTALL_TYPE_LABEL[input.installType]}`,
    `무상 A/S 종료일: ${input.freeAsEndDate}`,
  ];

  if (input.installType === "installer" && input.installerPhone) {
    lines.push(`기사님 연락처: ${formatKrPhone(input.installerPhone)}`);
  }

  lines.push("", "문의: https://o8znz.channel.io", "※ 발신전용");

  // 알림톡 템플릿 "설치정보 등록 완료". 문의 링크는 템플릿 버튼으로 빠져 있어
  // 변수에 넣지 않는다. 기사 연락처가 없는 자가/외부 설치는 레지스트리의
  // fallback("해당 없음")이 채운다.
  const alimtalk: AlimtalkRequest = {
    templateKey: "user_registration_completed",
    variables: {
      installType: INSTALL_TYPE_LABEL[input.installType],
      freeAsEndDate: input.freeAsEndDate,
      installerPhone:
        input.installType === "installer" && input.installerPhone
          ? formatKrPhone(input.installerPhone)
          : null,
    },
  };

  return {
    subject,
    text: lines.join("\n"),
    alimtalk,
  };
}
