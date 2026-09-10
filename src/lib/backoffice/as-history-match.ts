import vendorAliases from "@/lib/backoffice/as-history-vendor-aliases.json";

/**
 * ERP 원장의 기사명/거래처명을 시스템 installers 에 붙인다.
 *
 * 원장 실측(2026년): 거래처명 17종은 별칭 1개(피엘이앤지→PL)만 더하면 전부 붙고,
 * 담당기사 38종 중 25종이 붙는다. 나머지는 퇴사자이거나 미등록 기사라 원문만 남긴다.
 * 못 붙어도 버리지 않는다 — 화면에는 원문을 그대로 보여줘야 담당자가 판단할 수 있다.
 */
export type MatchableInstaller = {
  id: string;
  name: string;
  branch: string | null;
  active: boolean;
};

export type HistoryMatch = {
  installerId: string | null;
  branch: string | null;
  matchedBy: "INSTALLER_NAME" | "VENDOR_NAME" | "NONE";
};

const VENDOR_ALIASES: Record<string, string> = vendorAliases;

/** 공백·괄호·슬래시·가운뎃점을 걷어내고 소문자로. ERP 표기 흔들림을 흡수한다. */
export function normalizeMatchKey(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/[\s()[\]·・/,.'"]/g, "")
    .toLowerCase();
}

export function buildInstallerMatcher(installers: MatchableInstaller[]) {
  const byName = new Map<string, MatchableInstaller[]>();
  const byBranch = new Map<string, string>();

  for (const installer of installers) {
    const nameKey = normalizeMatchKey(installer.name);
    if (nameKey) {
      const bucket = byName.get(nameKey) ?? [];
      bucket.push(installer);
      byName.set(nameKey, bucket);
    }
    if (installer.branch) {
      const branchKey = normalizeMatchKey(installer.branch);
      if (branchKey) byBranch.set(branchKey, installer.branch);
    }
  }

  const branchKeys = [...byBranch.keys()];

  function matchInstallerName(raw: string | null): MatchableInstaller | null {
    const key = normalizeMatchKey(raw);
    if (!key) return null;

    // 1) 완전 일치. 동명이인이 있으면 사람이 골라야 하므로 확정하지 않는다.
    const exact = byName.get(key);
    if (exact) return exact.length === 1 ? exact[0] : null;

    // 2) ERP 가 이름 앞뒤에 업체를 붙여 쓴 경우("키플레이 장혁신", "이성규(신우열쇠)").
    //    두 글자 이름이 다른 단어에 우연히 박히는 걸 막으려고 3자 이상만 본다.
    const contained = [...byName.entries()].filter(
      ([nameKey, bucket]) => nameKey.length >= 3 && bucket.length === 1 && key.includes(nameKey),
    );
    return contained.length === 1 ? contained[0][1][0] : null;
  }

  function matchVendorBranch(raw: string | null): string | null {
    const rawText = String(raw ?? "").trim();
    if (!rawText) return null;

    const aliased = VENDOR_ALIASES[rawText];
    if (aliased) return aliased;

    const key = normalizeMatchKey(rawText);
    if (!key) return null;

    const exact = byBranch.get(key);
    if (exact) return exact;

    // 지점명은 길고 고유해서("의정부/롯데마트장암점") 부분 일치를 허용해도 안전하다.
    // 오타 꼬리("청도열쇠상사e")나 접두 누락("24시출장열쇠5G")이 여기서 붙는다.
    const partial = branchKeys.filter((b) => b.length >= 4 && (b.includes(key) || key.includes(b)));
    if (partial.length === 1) return byBranch.get(partial[0]) ?? null;
    return null;
  }

  return function match(input: { installerNameRaw: string | null; vendorName: string | null }): HistoryMatch {
    const branch = matchVendorBranch(input.vendorName);
    const installer = matchInstallerName(input.installerNameRaw);

    if (installer) {
      return { installerId: installer.id, branch: branch ?? installer.branch, matchedBy: "INSTALLER_NAME" };
    }
    if (branch) {
      return { installerId: null, branch, matchedBy: "VENDOR_NAME" };
    }
    return { installerId: null, branch: null, matchedBy: "NONE" };
  };
}
