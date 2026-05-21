import { prisma } from "@/lib/prisma";

/**
 * SMS 템플릿 변수 (placeholder).
 * `{branchName}` / `{installerPhone}` 형식으로 본문에 삽입한다.
 *
 * branchName     : 매칭된 설치기사의 지점명 (INSTALLERS 등록부 기준)
 * installerPhone : 매칭된 설치기사 연락처 (INSTALLERS 등록부 기준)
 * branch         : Excel 원본의 지점명 (매칭 후엔 보통 branchName 과 동일)
 * customerPhone  : 고객 연락처 (정규화 전 원본)
 */
export type SmsTemplateVars = {
  branchName: string;
  installerPhone: string;
  branch: string;
  customerPhone: string;
};

/** 사용 가능한 placeholder 키 (UI 표시용) */
export const SMS_TEMPLATE_PLACEHOLDERS: ReadonlyArray<{
  key: keyof SmsTemplateVars;
  label: string;
}> = [
  { key: "branchName", label: "기사 지점명 (등록부 기준)" },
  { key: "installerPhone", label: "기사 연락처 (등록부 기준)" },
  { key: "branch", label: "Excel 의 지점명 원본" },
  { key: "customerPhone", label: "고객 연락처 원본" },
];

/** 설치 배정 SMS 의 기본 템플릿 (DB 미설정시 fallback) */
export const DEFAULT_ASSIGNMENT_SMS_TEMPLATE =
  `아카라라이프 설치 배정 완료\n` +
  `{branchName} {installerPhone}\n` +
  `기사님 연락처 입니다`;

export const SMS_TEMPLATE_KEYS = {
  ASSIGNMENT: "assignment_completed",
} as const;

/** DB 에서 템플릿 본문을 가져온다. 없으면 fallback 반환. */
export async function getSmsTemplateBody(
  key: string,
  fallback: string
): Promise<string> {
  const row = await prisma.smsTemplate.findUnique({ where: { key } });
  return row?.body ?? fallback;
}

/** 템플릿 본문에서 `{key}` 형태 placeholder 를 vars 값으로 치환 */
export function renderTemplate(body: string, vars: SmsTemplateVars): string {
  return body.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (name in vars) return String(vars[name as keyof SmsTemplateVars]);
    return match; // 알 수 없는 placeholder 는 그대로 둠
  });
}
