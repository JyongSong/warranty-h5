import { normalizeSearchText, wallpadModelKey } from "./normalize";

type ModelLike = { brand: string; model: string; aliases: string[] };
type CaseLike = {
  siteName: string;
  siteKey: string | null;
  siteAddress: string | null;
  brand: string | null;
  model: string | null;
  result: string;
};
type NoteLike = { title: string; keywords: string[] };

export type CaseTally = { success: number; fail: number; special: number };

function emptyTally(): CaseTally {
  return { success: 0, fail: 0, special: 0 };
}

function addToTally(tally: CaseTally, result: string) {
  if (result === "SUCCESS") tally.success += 1;
  else if (result === "FAIL") tally.fail += 1;
  else if (result === "SPECIAL") tally.special += 1;
}

/** 모델 하나가 가리키는 모델명 키들(본 모델명 + 별칭). */
function modelKeys(model: ModelLike): string[] {
  return [model.model, ...model.aliases].map(wallpadModelKey).filter(Boolean);
}

/** 모델별 현장 사례 집계. 사례의 모델명을 같은 키로 맞춰 센다. */
export function tallyCasesByModel<M extends ModelLike & { id: string }>(
  models: M[],
  cases: CaseLike[],
): Map<string, CaseTally> {
  const idByKey = new Map<string, string>();
  for (const model of models) {
    for (const key of modelKeys(model)) if (!idByKey.has(key)) idByKey.set(key, model.id);
  }

  const tallies = new Map<string, CaseTally>();
  for (const row of cases) {
    const id = row.model ? idByKey.get(wallpadModelKey(row.model)) : undefined;
    if (!id) continue;
    const tally = tallies.get(id) ?? emptyTally();
    addToTally(tally, row.result);
    tallies.set(id, tally);
  }
  return tallies;
}

export type SiteGroup<C extends CaseLike> = {
  key: string;
  siteName: string;
  siteAddress: string | null;
  tally: CaseTally;
  cases: C[];
};

/** 사례를 단지 단위로 묶는다. 주소 키가 있으면 주소로, 없으면 단지명으로 묶는다. */
export function groupCasesBySite<C extends CaseLike>(cases: C[]): SiteGroup<C>[] {
  const groups = new Map<string, SiteGroup<C>>();
  for (const row of cases) {
    const key = row.siteKey ?? `name:${normalizeSearchText(row.siteName)}`;
    const group = groups.get(key) ?? {
      key,
      siteName: row.siteName,
      siteAddress: row.siteAddress,
      tally: emptyTally(),
      cases: [],
    };
    addToTally(group.tally, row.result);
    group.cases.push(row);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

/**
 * 통합 검색. 검색어 하나로 모델명(별칭 포함)·제조사, 단지명·주소, 제조사/시공사 의견을 모두 찾는다.
 * 모델명은 하이픈·공백을 무시하고 비교하므로 "khn q100" 도 KHN-Q100LT 를 찾는다.
 */
export function searchWallpadCompat<M extends ModelLike, C extends CaseLike, N extends NoteLike>(
  data: { models: M[]; cases: C[]; notes: N[] },
  query: string,
): { models: M[]; cases: C[]; notes: N[] } {
  const text = normalizeSearchText(query);
  const modelKey = wallpadModelKey(query);
  if (!text) return { models: [], cases: [], notes: [] };

  const includesText = (value: string | null | undefined) =>
    Boolean(value) && normalizeSearchText(value as string).includes(text);
  // 모델명은 두 글자 이상일 때만 부분 일치로 찾는다. 한 글자로는 거의 모든 모델이 걸린다.
  const includesModel = (value: string | null | undefined) =>
    modelKey.length >= 2 && Boolean(value) && wallpadModelKey(value as string).includes(modelKey);

  const models = data.models.filter(
    (m) => includesText(m.brand) || [m.model, ...m.aliases].some(includesModel),
  );
  const cases = data.cases.filter(
    (c) => includesText(c.siteName) || includesText(c.siteAddress) || includesText(c.brand) || includesModel(c.model),
  );
  // 의견은 키워드가 검색어에 들어 있는 경우도 찾는다: "평택센트럴자이3단지" → 키워드 "자이".
  const notes = data.notes.filter(
    (n) =>
      includesText(n.title) ||
      n.keywords.some((keyword) => {
        const key = normalizeSearchText(keyword);
        return key.length > 0 && (key.includes(text) || text.includes(key));
      }),
  );

  return { models, cases, notes };
}
