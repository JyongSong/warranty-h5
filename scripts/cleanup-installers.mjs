#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "csv-parse/sync";

const INPUT = process.argv[2] || "data/installers_rows.csv";
const SQL_OUT = process.argv[3] || "data/installers-cleaned.sql";
const REVIEW_OUT = process.argv[4] || "data/installers-need-review.csv";

const STANDARD_REGIONS = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

const REGION_ALIASES = {
  "서울특별시": "서울",
  "부산광역시": "부산",
  "대구광역시": "대구",
  "인천광역시": "인천",
  "광주광역시": "광주",
  "대전광역시": "대전",
  "울산광역시": "울산",
  "세종특별자치시": "세종",
  "경기도": "경기",
  "강원도": "강원",
  "강원특별자치도": "강원",
  "충청북도": "충북",
  "충청남도": "충남",
  "전라북도": "전북",
  "전북특별자치도": "전북",
  "전라남도": "전남",
  "경상북도": "경북",
  "경상남도": "경남",
  "제주도": "제주",
  "제주특별자치도": "제주",
};

const REGION_CITIES = {
  "서울": [
    "강남구", "서초구", "송파구", "강동구", "동대문구", "중랑구", "성동구", "광진구",
    "영등포구", "구로구", "금천구", "용산구", "동작구", "은평구", "서대문구", "마포구",
    "강서구", "노원구", "도봉구", "강북구", "성북구", "관악구", "양천구", "종로구",
    "중구", "서대문구",
  ],
  "경기": [
    "성남시", "광주시", "하남시", "구리시", "남양주시", "화성시", "부천시", "시흥시",
    "김포시", "안산시", "군포시", "안양시", "양주시", "의정부시", "동두천시", "포천시",
    "평택시", "수원시", "과천시", "용인시", "여주시", "안성시", "오산시", "광명시",
    "의왕시", "파주시", "고양시", "이천시", "가평군", "양평군",
  ],
  "인천": ["미추홀구", "부평구", "남동구", "연수구", "계양구", "중구", "동구", "서구", "강화군", "옹진군"],
  "강원": ["춘천시", "원주시", "강릉시", "동해시", "속초시", "삼척시", "태백시"],
  "충북": ["청주시", "충주시", "제천시"],
  "충남": ["천안시", "아산시", "서산시", "당진시", "공주시", "보령시", "논산시", "계룡시", "예산군", "부여군", "금산군", "청양군", "홍성군"],
  "대전": ["유성구", "서구", "중구", "동구", "대덕구"],
  "경북": ["포항시", "경주시", "경산시", "구미시", "안동시", "영주시", "김천시", "문경시", "영천시", "상주시"],
  "경남": ["진주시", "사천시", "양산시", "김해시", "창원시", "거제시", "통영시", "밀양시", "산청군", "함안군", "거창군", "합천군"],
  "부산": ["해운대구", "수영구", "남구", "동구", "서구", "중구", "북구", "사하구", "사상구", "강서구", "연제구", "부산진구", "동래구", "금정구", "기장군"],
  "울산": ["남구", "북구", "동구", "중구", "울주군"],
  "광주": ["동구", "서구", "남구", "북구", "광산구"],
  "전남": ["목포시", "순천시", "여수시", "광양시", "나주시"],
  "전북": ["전주시", "군산시", "김제시", "익산시", "정읍시", "남원시"],
  "제주": ["제주시", "서귀포시"],
  "세종": ["세종시"],
};

// Aliases / abbreviations (without 시/구/군 suffix) → canonical name within a region.
// Only includes UNAMBIGUOUS short forms. Names that conflict across regions (동구, 서구, 중구, 광주, ...)
// are intentionally left out and resolved via region context.
const SHORT_TO_CANONICAL = {
  "서울": {
    "강남": "강남구", "서초": "서초구", "송파": "송파구", "강동": "강동구",
    "동대문": "동대문구", "중랑": "중랑구", "성동": "성동구", "광진": "광진구",
    "영등포": "영등포구", "구로": "구로구", "금천": "금천구", "용산": "용산구",
    "동작": "동작구", "은평": "은평구", "서대문": "서대문구", "마포": "마포구",
    "강서": "강서구", "노원": "노원구", "도봉": "도봉구", "강북": "강북구",
    "성북": "성북구", "관악": "관악구", "양천": "양천구", "종로": "종로구",
    "목동": "양천구",
  },
  "경기": {
    "성남": "성남시", "하남": "하남시", "구리": "구리시", "남양주": "남양주시",
    "화성": "화성시", "동탄": "화성시", "부천": "부천시", "시흥": "시흥시",
    "김포": "김포시", "안산": "안산시", "군포": "군포시", "안양": "안양시",
    "양주": "양주시", "의정부": "의정부시", "동두천": "동두천시", "포천": "포천시",
    "평택": "평택시", "수원": "수원시", "과천": "과천시", "용인": "용인시",
    "여주": "여주시", "안성": "안성시", "오산": "오산시", "광명": "광명시",
    "의왕": "의왕시", "파주": "파주시", "고양": "고양시", "이천": "이천시",
    "일산": "고양시", "가평": "가평군", "양평": "양평군",
    "광주": "광주시", // 경기 광주 (≠ 광주광역시) - resolved by context
  },
  "강원": {
    "춘천": "춘천시", "원주": "원주시", "강릉": "강릉시",
    "동해": "동해시", "속초": "속초시",
  },
  "충북": { "청주": "청주시", "충주": "충주시" },
  "충남": {
    "천안": "천안시", "아산": "아산시", "서산": "서산시", "당진": "당진시",
    "공주": "공주시", "논산": "논산시", "계룡": "계룡시", "예산": "예산군",
    "부여": "부여군", "금산": "금산군",
  },
  "경북": {
    "포항": "포항시", "경주": "경주시", "경산": "경산시", "구미": "구미시",
    "안동": "안동시", "김천": "김천시",
  },
  "경남": {
    "진주": "진주시", "사천": "사천시", "양산": "양산시", "김해": "김해시",
    "창원": "창원시", "거제": "거제시", "통영": "통영시", "밀양": "밀양시",
    "산청": "산청군",
  },
  "전남": {
    "목포": "목포시", "순천": "순천시", "여수": "여수시", "광양": "광양시",
    "나주": "나주시",
  },
  "전북": {
    "전주": "전주시", "군산": "군산시", "김제": "김제시", "익산": "익산시",
  },
  "제주": { "제주": "제주시", "서귀포": "서귀포시" },
  "세종": { "세종": "세종시" },
};

// Reverse: city name → list of regions where it exists.
// Used when we need to figure out region from a bare city name.
function buildCityToRegions() {
  const map = {};
  function add(name, region) {
    if (!map[name]) map[name] = new Set();
    map[name].add(region);
  }
  for (const [region, cities] of Object.entries(REGION_CITIES)) {
    for (const c of cities) add(c, region);
  }
  for (const [region, shorts] of Object.entries(SHORT_TO_CANONICAL)) {
    for (const s of Object.keys(shorts)) add(s, region);
  }
  return map;
}
const CITY_TO_REGIONS = buildCityToRegions();

function normalizeRegionField(raw) {
  const s = (raw || "").trim();
  if (!s) return null;
  if (STANDARD_REGIONS.includes(s)) return s;
  if (REGION_ALIASES[s]) return REGION_ALIASES[s];
  // "경기 부천" / "경기 광주" / "서울 경기" — first standard region prefix wins.
  // Skip "서울 경기" (mixed) by detecting space-separated standard regions.
  const tokens = s.split(/\s+/);
  const stdInTokens = tokens.filter((t) => STANDARD_REGIONS.includes(t));
  if (stdInTokens.length === 1) return stdInTokens[0];
  if (stdInTokens.length > 1) return null; // ambiguous
  // 경기북부 / 경기남부 → 경기
  for (const r of STANDARD_REGIONS) if (s.startsWith(r)) return r;
  // City name as region (e.g. 천안, 진주, 포항, 구미시)
  const candidates = CITY_TO_REGIONS[s.replace(/\s/g, "")];
  if (candidates && candidates.size === 1) return [...candidates][0];
  return null;
}

function parseAbility(text) {
  const capabilities = new Set();
  let aqara = "NONE";
  let hub = false;

  if (!text) {
    return { capabilities: [], aqaraAppCapability: "NONE", hasAqaraHubInventory: false };
  }

  const hubMatch = text.match(/Aqara 도어락용 연동기[:\s]*(보유|미보유)/);
  if (hubMatch) hub = hubMatch[1] === "보유";

  // Aqara app capability — match the survey segment if present
  const appMatch = text.match(/Aqara 앱 연동\/설정 서비스[:\s]*([^,]+)/);
  if (appMatch) {
    const desc = appMatch[1];
    if (desc.includes("허브")) aqara = "DOORLOCK_AND_APP_AND_HUB";
    else if (desc.includes("앱 연동")) aqara = "DOORLOCK_AND_APP";
    else aqara = "NONE";
  } else if (text.includes("Aqara 허브 연동")) {
    aqara = "DOORLOCK_AND_APP_AND_HUB";
  } else if (text.includes("Aqara 앱 연동")) {
    aqara = "DOORLOCK_AND_APP";
  }

  if (text.includes("도어락")) capabilities.add("DOORLOCK");
  if (text.includes("도어벨")) capabilities.add("DOORBELL");
  // 월패드 연동기 (new format) OR bare 연동기 (old format, where 연동기 = 월패드 연동기)
  if (text.includes("월패드 연동기") || /(^|[,\s])연동기/.test(text)) {
    capabilities.add("WALLPAD_HUB");
  }
  const otherIndicators = [
    "기타", "조명", "커튼", "cctv", "CCTV", "iot", "IoT", "홈캠", "실링팬",
    "출입통제", "인테리어",
  ];
  if (otherIndicators.some((k) => text.includes(k))) capabilities.add("OTHER");

  return {
    capabilities: [...capabilities],
    aqaraAppCapability: aqara,
    hasAqaraHubInventory: hub,
  };
}

const NOISE_TOKENS = new Set([
  "전역", "전체", "등", "권", "-", "및", "과", "이상", "이상은",
]);

function tokenizeCoverage(text) {
  if (!text) return [];
  return text
    .split(/[,，、\/\n\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !NOISE_TOKENS.has(t));
}

// Resolve a single coverage token to { region, name } or null.
function resolveToken(token, regionHint) {
  let t = token
    .replace(/\(.+?\)/g, "") // strip parenthetical clauses
    .replace(/\s*전역\s*$/, "")
    .replace(/\s*전체\s*$/, "")
    .replace(/까지\s*$/, "")
    .trim();
  if (!t) return null;

  // 1) regionHint context first — disambiguates names that conflict with 광역 names
  //    (e.g. "광주" with regionHint=경기 → 경기 광주시, NOT 광주광역시)
  if (regionHint) {
    const canonical =
      SHORT_TO_CANONICAL[regionHint]?.[t] ||
      (REGION_CITIES[regionHint]?.includes(t) ? t : null);
    if (canonical) return { region: regionHint, name: canonical };
  }

  // 2) Token is just a 광역 name
  if (STANDARD_REGIONS.includes(t)) return { region: t, name: null };
  if (REGION_ALIASES[t]) return { region: REGION_ALIASES[t], name: null };

  // 3) Region prefix: "서울 강남구" / "경기 광주" / "서울강남구"
  for (const r of STANDARD_REGIONS) {
    let rest = null;
    if (t.startsWith(r + " ")) rest = t.slice(r.length).trim();
    else if (t.startsWith(r) && t.length > r.length) rest = t.slice(r.length);
    if (rest != null) {
      const canonical =
        SHORT_TO_CANONICAL[r]?.[rest] ||
        (REGION_CITIES[r]?.includes(rest) ? rest : null);
      if (canonical) return { region: r, name: canonical };
      return { region: r, name: null, unmappedRest: rest };
    }
  }

  // 4) Bare city with global lookup
  const candidates = CITY_TO_REGIONS[t];
  if (candidates) {
    if (candidates.size === 1) {
      const region = [...candidates][0];
      const canonical = SHORT_TO_CANONICAL[region]?.[t] || t;
      return { region, name: canonical };
    }
    if (regionHint && candidates.has(regionHint)) {
      const canonical = SHORT_TO_CANONICAL[regionHint]?.[t] || t;
      return { region: regionHint, name: canonical };
    }
  }

  return null;
}

function inferFromCoverage(coverageText) {
  const tokens = tokenizeCoverage(coverageText);
  const regionCounts = {};
  for (const tok of tokens) {
    const r = resolveToken(tok, null);
    if (r) regionCounts[r.region] = (regionCounts[r.region] || 0) + 1;
  }
  const entries = Object.entries(regionCounts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return { region: null, ambiguous: true };
  if (entries.length === 1) return { region: entries[0][0], ambiguous: false };
  return { region: entries[0][0], ambiguous: true };
}

function buildServiceAreas(coverageText, region) {
  if (!coverageText || !region) {
    return { areas: [], unmapped: [], crossRegion: false };
  }
  const tokens = tokenizeCoverage(coverageText);
  const areas = [];
  const unmapped = [];
  const otherRegions = new Set();

  for (const tok of tokens) {
    const r = resolveToken(tok, region);
    if (!r) {
      unmapped.push(tok);
      continue;
    }
    if (r.region !== region) {
      otherRegions.add(r.region);
      continue;
    }
    if (r.name) {
      const full = `${region} ${r.name}`;
      if (!areas.includes(full)) areas.push(full);
    }
    // r.name == null → just the region itself, fallback to region-only
  }

  return { areas, unmapped, crossRegion: otherRegions.size > 0 };
}

function processRow(row) {
  const ability = parseAbility(row.ability);

  let region = normalizeRegionField(row.region);
  let regionFromCoverage = false;
  let regionAmbiguous = false;

  if (!region) {
    const guess = inferFromCoverage(row.coverage);
    region = guess.region;
    regionAmbiguous = guess.ambiguous;
    regionFromCoverage = !!region;
  }

  const sa = buildServiceAreas(row.coverage, region);

  const reasons = [];
  if (!region) reasons.push("REGION_UNKNOWN");
  if (regionAmbiguous) reasons.push("REGION_AMBIGUOUS");
  if (sa.crossRegion) reasons.push("COVERAGE_CROSS_REGION");
  if ((row.coverage || "").includes("(")) reasons.push("COVERAGE_HAS_CONDITIONAL");
  const totalTokens = Math.max(1, tokenizeCoverage(row.coverage).length);
  if (sa.unmapped.length > 0 && sa.unmapped.length / totalTokens > 0.4) {
    reasons.push("COVERAGE_TOO_MANY_UNMAPPED");
  }

  return {
    row,
    ability,
    region,
    regionFromCoverage,
    serviceAreas: sa.areas,
    unmapped: sa.unmapped,
    needsReview: reasons.length > 0,
    reasons,
  };
}

function escapeSql(s) {
  return s.replace(/'/g, "''");
}

function arrayLiteral(arr) {
  if (arr.length === 0) return "ARRAY[]::text[]";
  return `ARRAY[${arr.map((s) => `'${escapeSql(s)}'`).join(", ")}]::text[]`;
}

function rowToSql(result) {
  const { row, ability, region, serviceAreas } = result;
  return `UPDATE public.installers SET
  region = '${escapeSql(region)}',
  service_areas = ${arrayLiteral(serviceAreas)},
  capabilities = ${arrayLiteral(ability.capabilities)},
  aqara_app_capability = '${ability.aqaraAppCapability}',
  has_aqara_hub_inventory = ${ability.hasAqaraHubInventory},
  active = true,
  updated_at = NOW()
WHERE id = '${row.id}';
-- ${row.name} (${row.phone}) | raw region: ${row.region || ""} | raw coverage: ${row.coverage || ""}`;
}

const csvText = readFileSync(INPUT, "utf8");
const rows = parse(csvText, { columns: true, skip_empty_lines: true });

const sqlRows = [];
const reviewRows = [];

for (const row of rows) {
  const result = processRow(row);
  if (result.needsReview) {
    reviewRows.push({
      id: row.id,
      name: row.name,
      phone: row.phone,
      branch: row.branch || "",
      raw_region: row.region || "",
      raw_coverage: row.coverage || "",
      raw_ability: row.ability || "",
      inferred_region: result.region || "",
      inferred_service_areas: result.serviceAreas.join(" | "),
      inferred_capabilities: result.ability.capabilities.join(" | "),
      inferred_aqara_app_capability: result.ability.aqaraAppCapability,
      inferred_has_aqara_hub_inventory: String(result.ability.hasAqaraHubInventory),
      unmapped_tokens: result.unmapped.join(" | "),
      review_reason: result.reasons.join(" | "),
    });
  } else {
    sqlRows.push(rowToSql(result));
  }
}

const header = `-- Auto-generated installer data cleanup
-- Source: ${INPUT}
-- Generated: ${new Date().toISOString()}
-- Auto-cleaned rows: ${sqlRows.length}
-- Review-needed rows: ${reviewRows.length}
--
-- IMPORTANT: Run inside a transaction to verify before commit.
--   BEGIN; (paste below) ROLLBACK;  -- inspect, then COMMIT
-- ============================================================

BEGIN;

`;
const footer = `\nCOMMIT;\n`;

writeFileSync(SQL_OUT, header + sqlRows.join("\n\n") + footer);

if (reviewRows.length > 0) {
  const cols = Object.keys(reviewRows[0]);
  const csvOut = [
    cols.join(","),
    ...reviewRows.map((r) =>
      cols
        .map((c) => {
          const v = String(r[c] ?? "");
          return /[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(","),
    ),
  ].join("\n");
  writeFileSync(REVIEW_OUT, csvOut);
}

console.log(`✓ Auto-cleaned: ${sqlRows.length} rows → ${SQL_OUT}`);
console.log(`⚠ Need review:  ${reviewRows.length} rows → ${REVIEW_OUT}`);
console.log("");
console.log("Reason breakdown:");
const reasonCounts = {};
for (const r of reviewRows) {
  for (const reason of r.review_reason.split(" | ")) {
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  }
}
for (const [reason, count] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${reason}: ${count}`);
}
