/**
 * 카카오 알림톡 템플릿 레지스트리.
 *
 * 템플릿 본문/버튼의 원본은 솔라피(카카오)에 등록된 것이고, 여기에는 발송에
 * 필요한 templateId 와 변수 계약만 둔다. 본문을 여기 복사해두지 않는 이유는
 * 카카오 심사를 거쳐야 바뀌는 값이라 코드와 쉽게 어긋나기 때문이다.
 *
 * 알림톡은 변수 값이 비면 발송 자체가 실패하므로, 값이 없을 수 있는 변수는
 * 반드시 fallback 을 선언해 둔다.
 */

export type AlimtalkTemplateKey =
  | "user_registration_completed"
  | "installer_confirm_link"
  | "assignment_completed";

type AlimtalkTemplateSpec = {
  /** 솔라피에 등록된 템플릿 ID */
  templateId: string;
  /** 솔라피 등록 템플릿명 (조회/디버깅용) */
  name: string;
  /** 템플릿에 선언된 변수명 (`#{}` 제외). 이 목록과 정확히 일치해야 한다. */
  variables: readonly string[];
  /**
   * 템플릿 버튼 링크가 `https://#{var}` 형태로 등록된 변수.
   * 값에 프로토콜이 남아 있으면 `https://https://...` 가 되므로 떼어낸다.
   */
  linkVariables?: readonly string[];
  /** 값이 비었을 때 대신 넣을 문자열. 없으면 빈 값은 오류로 처리한다. */
  fallbacks?: Readonly<Record<string, string>>;
  /** 대체발송(SMS) 문구가 어느 빌더에서 오는지 등 운영 메모 */
  note?: string;
};

export const ALIMTALK_TEMPLATES = {
  // 2번: 제품정보 등록 완료 안내 (buildUserCompletionSms 와 짝)
  user_registration_completed: {
    templateId: "KA01TP260707013631984kPpD8oGMoiN",
    name: "설치정보 등록 완료",
    variables: ["installType", "freeAsEndDate", "installerPhone"],
    // 자가/외부 기사 설치는 기사 연락처가 없다.
    fallbacks: { installerPhone: "해당 없음" },
  },
  // 3번: 인증기사에게 보내는 설치 확인 링크
  installer_confirm_link: {
    templateId: "KA01TP260707014508159QdT8kNfgqpc",
    name: "설치정보 기사 확인 링크",
    variables: ["confirmLink"],
    linkVariables: ["confirmLink"],
    note: "버튼 링크가 https://#{confirmLink} 로 등록되어 있어 값에서 프로토콜을 제거한다.",
  },
  // 5번(엑셀 일괄) / 10번(신규 배차 플로우) 공용
  assignment_completed: {
    templateId: "KA01TP26070707483285849dA5feTIvF",
    name: "기사배정 완료 안내문(사본)",
    variables: ["branchName", "installerPhone"],
  },
} as const satisfies Record<AlimtalkTemplateKey, AlimtalkTemplateSpec>;

export type AlimtalkVariables = Record<string, string | null | undefined>;

export type AlimtalkRequest = {
  templateKey: AlimtalkTemplateKey;
  variables: AlimtalkVariables;
};

/** 솔라피 send() 의 kakaoOptions 로 그대로 넘길 수 있는 형태 */
export type AlimtalkKakaoOptions = {
  pfId: string;
  templateId: string;
  variables: Record<string, string>;
  disableSms: false;
};

export class AlimtalkTemplateError extends Error {
  constructor(
    public readonly code:
      | "PF_ID_MISSING"
      | "UNKNOWN_TEMPLATE"
      | "VARIABLE_MISSING"
      | "VARIABLE_UNKNOWN",
    message: string,
  ) {
    super(message);
    this.name = "AlimtalkTemplateError";
  }
}

export function getAlimtalkPfId(): string | null {
  const pfId = process.env.SOLAPI_KAKAO_PF_ID?.trim();
  return pfId ? pfId : null;
}

export function getAlimtalkTemplate(key: AlimtalkTemplateKey): AlimtalkTemplateSpec {
  const spec = ALIMTALK_TEMPLATES[key];
  if (!spec) {
    throw new AlimtalkTemplateError("UNKNOWN_TEMPLATE", `알 수 없는 알림톡 템플릿: ${key}`);
  }
  return spec;
}

/**
 * 템플릿 변수 계약을 검증하고 솔라피 kakaoOptions 를 만든다.
 *
 * - 템플릿에 없는 변수를 넘기면 오류 (오타로 값이 조용히 누락되는 것을 막는다)
 * - 값이 비었는데 fallback 도 없으면 오류 (알림톡은 빈 변수를 허용하지 않는다)
 * - disableSms 는 항상 false: 카카오 발송 실패 시 기존 SMS 문구로 대체발송된다
 */
export function buildAlimtalkKakaoOptions(request: AlimtalkRequest): AlimtalkKakaoOptions {
  const pfId = getAlimtalkPfId();
  if (!pfId) {
    throw new AlimtalkTemplateError("PF_ID_MISSING", "SOLAPI_KAKAO_PF_ID 환경변수가 없습니다.");
  }

  const spec = getAlimtalkTemplate(request.templateKey);
  const declared = new Set<string>(spec.variables);
  const linkVariables = new Set<string>(spec.linkVariables ?? []);

  for (const name of Object.keys(request.variables)) {
    if (!declared.has(name)) {
      throw new AlimtalkTemplateError(
        "VARIABLE_UNKNOWN",
        `${request.templateKey} 템플릿에 없는 변수입니다: ${name}`,
      );
    }
  }

  const variables: Record<string, string> = {};

  for (const name of spec.variables) {
    const raw = request.variables[name];
    let value = typeof raw === "string" ? raw.trim() : "";

    if (value === "") {
      const fallback = spec.fallbacks?.[name];
      if (fallback === undefined) {
        throw new AlimtalkTemplateError(
          "VARIABLE_MISSING",
          `${request.templateKey} 템플릿 변수 값이 비어 있습니다: ${name}`,
        );
      }
      value = fallback;
    }

    if (linkVariables.has(name)) {
      value = stripUrlProtocol(value);
    }

    variables[`#{${name}}`] = value;
  }

  return {
    pfId,
    templateId: spec.templateId,
    variables,
    disableSms: false,
  };
}

/** `https://a.com/b` → `a.com/b`. 템플릿 버튼이 프로토콜을 이미 갖고 있을 때 쓴다. */
export function stripUrlProtocol(url: string): string {
  return url.replace(/^https?:\/\//i, "");
}
