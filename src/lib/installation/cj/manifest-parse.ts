// CJ 주문번호 명단의 순수 파싱·정규화. Prisma 를 끌어오지 않으므로 단독으로
// 테스트할 수 있다. DB 를 만지는 쪽은 manifest.ts 에 있다.

// 고객이 손으로 입력하는 값이라 공백·하이픈·전각 문자를 흡수한다. 대소문자는
// 위로 맞춘다(주문번호에 영문이 섞여 있어도 같은 건으로 보이게).
export function normalizeCjOrderNo(raw: string | null | undefined) {
  if (!raw) return "";

  return raw
    .normalize("NFKC")
    .replace(/[\s-]/g, "")
    .trim()
    .toUpperCase();
}

export function isValidCjOrderNoFormat(orderNo: string) {
  // 자릿수를 못 박지 않는다(채널 주문번호 체계가 바뀌어도 업로드된 명단이
  // 기준이므로). 명백한 오입력만 거른다.
  return /^[A-Z0-9]{6,32}$/.test(orderNo);
}

export type ParsedManifestRows = {
  rows: { orderNo: string; orderDate: string | null }[];
  totalRows: number;
  invalidCount: number;
};

// CSV/TSV 텍스트에서 주문번호를 뽑는다. CJ 가 자기 리포트를 그대로 내보내
// 올릴 수 있도록 첫 번째 열만 주문번호로 보고 나머지는 무시한다. 두 번째 열이
// 날짜로 보이면 주문일로 받는다.
export function parseCjManifestText(text: string): ParsedManifestRows {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);

  const rows: { orderNo: string; orderDate: string | null }[] = [];
  const seen = new Set<string>();
  let invalidCount = 0;
  let totalRows = 0;

  for (const line of lines) {
    const cells = splitDelimitedLine(line);
    const orderNo = normalizeCjOrderNo(cells[0]);

    // 헤더 행은 조용히 건너뛴다(잘못된 행으로 세지 않는다).
    if (isHeaderCell(cells[0])) continue;

    totalRows += 1;

    if (!orderNo || !isValidCjOrderNoFormat(orderNo)) {
      invalidCount += 1;
      continue;
    }
    if (seen.has(orderNo)) continue;

    seen.add(orderNo);
    rows.push({ orderNo, orderDate: parseOrderDate(cells[1]) });
  }

  return { rows, totalRows, invalidCount };
}

function splitDelimitedLine(line: string) {
  const delimiter = line.includes("\t") ? "\t" : ",";
  return line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

function isHeaderCell(cell: string | undefined) {
  if (!cell) return false;
  const normalized = cell.trim().toLowerCase();
  return ["주문번호", "orderno", "order_no", "order no", "주문 번호"].includes(normalized);
}

function parseOrderDate(cell: string | undefined) {
  if (!cell) return null;

  const digits = cell.replace(/[^\d]/g, "");
  if (digits.length !== 8) return null;

  const ymd = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return Number.isNaN(new Date(ymd).getTime()) ? null : ymd;
}
