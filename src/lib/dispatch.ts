import sql from 'mssql'
import { getErpPool } from './erp'

// ============================================================
// Types
// ============================================================

export type DispatchRow = {
  customer_name: string | null
  phone:         string | null
  address:       string | null
  order_numbers: string | null
  no_girl:       string | null
  due_date:      string | null    // YYYYMMDD (group 내 가장 빠른 날짜)
  memo:          string | null
}

export type DispatchAssignment = DispatchRow & {
  business_number: string                  // 거래처
  branch_name:     string                  // 지점명
  item_code:       string | null           // 품목코드
  item_name:       string | null           // 품목명
  quantity:        number | null           // 수량
}

// ============================================================
// Constants (Excel 모범 예시 기반)
// ============================================================

/** YYYYMMDD → YYYY/MM/DD */
export function formatDueDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(6, 8)}`
}

export const DISPATCH_CONST = {
  창고:         '본사',
  담당자:       '서다은',
  수리유형:     '설치',
  설치완료여부: '접수',
} as const

// ============================================================
// Installer Registry (설치기사목록_v2.xlsx 기준)
// installation-assignment-app/server/excelAssignment.ts 와 동일한 로직 사용
// ============================================================

type Installer = {
  businessNumber:     string
  branchName:         string
  phone:              string         // 기사님 연락처 (SMS 발송용 — 직접 채워 넣기)
  installationRegion: string         // 설치지역 (시/도 수준)
  possibleRegion:     string         // 가능지역 (구/시 수준, 쉼표 구분)
  impossibleRegion:   string         // 불가지역
}

const INSTALLERS: readonly Installer[] = [
  { businessNumber: '211-10-11445', branchName: '강남/열쇠닥터',                phone: '010-5168-2509', installationRegion: '서울',     possibleRegion: '강남구, 서초구, 송파구, 강동구',     impossibleRegion: '' },
  { businessNumber: '204-27-28418', branchName: '동대문/24시출장열쇠',          phone: '010-2122-9140', installationRegion: '서울',     possibleRegion: '동대문구, 중랑구, 성동구, 광진구',   impossibleRegion: '' },
  { businessNumber: '868-88-00353', branchName: '서울경기포항/24시출장열쇠5G',  phone: '010-6530-6760', installationRegion: '서울',     possibleRegion: '광진구, 하남시',                       impossibleRegion: '' },
  { businessNumber: '112-48-04825', branchName: '관악/신우열쇠',                phone: '010-4003-1382', installationRegion: '서울',     possibleRegion: '영등포구, 동작구, 관악구',            impossibleRegion: '' },
  { businessNumber: '519-19-02649', branchName: '키플레이',                phone: '010-9220-3336', installationRegion: '경기도',     possibleRegion: '하남시, 성남시, 용인시, 수원시, 안성시, 평택시',            impossibleRegion: '' },
  { businessNumber: '110-17-24326', branchName: '용인/24시출장열쇠',            phone: '010-2084-5500', installationRegion: '경기도',   possibleRegion: '용인시, 수원시',                       impossibleRegion: '수원시 영통구' },
  { businessNumber: '124-28-81512', branchName: '화성/신영통열쇠',              phone: '010-3602-3477', installationRegion: '경기도',   possibleRegion: '화성시, 동탄시, 수원 영통구',         impossibleRegion: '' },
  { businessNumber: '134-24-54294', branchName: '안산/24시열쇠나라',            phone: '010-4733-5445', installationRegion: '경기도',   possibleRegion: '안산시',     impossibleRegion: '' },
  { businessNumber: '126-12-75562', branchName: '경기광주/청도열쇠상사e',       phone: '010-3364-8385', installationRegion: '경기도',   possibleRegion: '광주시',                               impossibleRegion: '' },
  { businessNumber: '130-14-95576', branchName: '경기열쇠상사',                 phone: '010-2245-2222', installationRegion: '전국',     possibleRegion: '인천, 부천, 전지역',                  impossibleRegion: '연천군, 가장군' },  // 기본/Fallback
  { businessNumber: '136-46-00419', branchName: '의정부/롯데마트 장암점',       phone: '010-4819-4568', installationRegion: '경기도',   possibleRegion: '의정부시',                             impossibleRegion: '' },
  { businessNumber: '856-21-00558', branchName: '대전/영신열쇠',                phone: '010-3444-8981', installationRegion: '충청남도', possibleRegion: '대전',                                 impossibleRegion: '' },
  { businessNumber: '605-23-84667', branchName: '부산/열쇠특공대',              phone: '010-8542-5122', installationRegion: '경상북도', possibleRegion: '부산',                                 impossibleRegion: '강서구, 부산' },
  //{ businessNumber: '114-86-91070', branchName: '피엘이앤지',                   phone: '', installationRegion: '전ㄱ',     possibleRegion: '전국',                                 impossibleRegion: '' },
]

const DEFAULT_INSTALLER: Installer = INSTALLERS.find(i => i.businessNumber === '130-14-95576') ?? INSTALLERS[0]
const IMPOSSIBLE_INSTALLER: Installer = {
  businessNumber: '000-00-00000',
  branchName: '설치불가 지역',
  phone: '',
  installationRegion: '',
  possibleRegion: '',
  impossibleRegion: ''
}

/** 지점명으로 설치기사 조회. 정확히 일치하지 않으면 null 반환. */
export function findInstallerByBranch(branchName: string): { branchName: string; phone: string } | null {
  const target = branchName.trim()
  if (!target) return null
  const found = INSTALLERS.find(i => i.branchName === target)
  return found ? { branchName: found.branchName, phone: found.phone } : null
}

// ============================================================
// String normalization helpers
// ============================================================

const toText = (v: unknown): string => v == null ? '' : String(v).trim()

const normalizeCompact = (v: unknown): string =>
  toText(v).replace(/^﻿/, '').replace(/\s+/g, '')

// ============================================================
// Region matching (V2 mode — possibleRegion + impossibleRegion 기반)
// ============================================================

function isUniversalRegion(value: string): boolean {
  const n = normalizeCompact(value)
  return n === '전국' || n === '전체' || n === '전지역' || n.startsWith('전ㄱ')
}

function splitRegionTokens(value: string): string[] {
  const seen = new Set<string>()
  return value
    .replace(/\([^)]*제외[^)]*\)/g, ' ')
    .replace(/（[^）]*제외[^）]*）/g, ' ')
    .split(/[\/／|·,，;；\n\r\t]+/g)
    .map(t => t.trim())
    .filter(Boolean)
    .filter(t => {
      const n = normalizeCompact(t)
      if (!n || seen.has(n)) return false
      seen.add(n)
      return true
    })
}

function tokenMatchesAddress(token: string, normalizedAddress: string): boolean {
  const nt = normalizeCompact(token)
  if (!nt) return false
  if (isUniversalRegion(nt)) return true
  if (normalizedAddress.includes(nt)) return true

  const parts = token.split(/\s+/g).map(p => normalizeCompact(p)).filter(Boolean)
  if (parts.length > 1 && parts.every(p => normalizedAddress.includes(p))) return true

  if (/^[가-힣]{2,}$/.test(nt)) {
    return normalizedAddress.includes(`${nt}시`) ||
           normalizedAddress.includes(`${nt}구`) ||
           normalizedAddress.includes(`${nt}군`)
  }
  return false
}

function installationRegionMatchesAddress(inst: Installer, normalizedAddress: string): boolean {
  const ir = toText(inst.installationRegion)
  if (!ir || isUniversalRegion(ir)) return true
  if (splitRegionTokens(ir).some(t => tokenMatchesAddress(t, normalizedAddress))) return true
  const pTokens = splitRegionTokens(toText(inst.possibleRegion))
  return pTokens.some(t => !isUniversalRegion(t) && tokenMatchesAddress(t, normalizedAddress))
}

function impossibleRegionMatchesAddress(inst: Installer, normalizedAddress: string): boolean {
  return splitRegionTokens(toText(inst.impossibleRegion)).some(t => tokenMatchesAddress(t, normalizedAddress))
}

function getV2MatchScore(inst: Installer, normalizedAddress: string): number {
  if (!installationRegionMatchesAddress(inst, normalizedAddress)) return 0
  if (impossibleRegionMatchesAddress(inst, normalizedAddress)) return 0

  const pTokens = splitRegionTokens(toText(inst.possibleRegion))
  if (pTokens.length === 0) return 0

  const scores = pTokens
    .filter(t => tokenMatchesAddress(t, normalizedAddress))
    .map(t => isUniversalRegion(t) ? 1 : normalizeCompact(t).length + 10)

  return scores.length > 0 ? Math.max(...scores) : 0
}

/**
 * 주소 → 동점 (가장 높은 score) 후보 설치기사 목록.
 * 매칭 실패시 default (경기열쇠상사) 단일 반환.
 *
 * 후보가 여러 명이면 호출자 (assignDispatch) 가 round-robin 으로 균등 분배.
 */
export function matchInstallerCandidates(address: string): Installer[] {
  const n = normalizeCompact(address)
  if (!n) return [DEFAULT_INSTALLER]

  const scored = INSTALLERS
    .map((inst, idx) => ({ inst, idx, score: getV2MatchScore(inst, n) }))
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score || a.idx - b.idx)

  if (scored.length === 0) {
    if (impossibleRegionMatchesAddress(DEFAULT_INSTALLER, n)) {
      return [IMPOSSIBLE_INSTALLER]
    }
    return [DEFAULT_INSTALLER]
  }
  const maxScore = scored[0].score
  return scored.filter(m => m.score === maxScore).map(m => m.inst)
}

/**
 * 주소 → 단일 설치기사 매칭. 매칭 실패시 default (경기열쇠상사) 반환.
 * 동점 후보 중 첫 번째 (배열 순서) 를 반환하므로 기존 동작과 호환.
 * 균등 분배가 필요하면 matchInstallerCandidates 를 사용.
 */
export function matchInstaller(address: string): Installer {
  return matchInstallerCandidates(address)[0]
}

// ============================================================
// 품목 결정 (memo에 K100/L100 + 월패드 연동 키워드로 판별)
// 매핑:
//   "용역 도어락 설치비(L100)+월패드 연동(RF447)" → 00048 L100도어락설치+월패드연동설치
//   "용역 도어락 설치비(K100)+월패드 연동(RF447)" → 00049 K100도어락설치+월패드연동설치
//   L100                                         → 00047 L100도어락설치
//   K100                                         → 00050 K100도어락설치
//   기타                                         → null (Q/R 비움)
// 우선순위: 콤보(월패드 연동) > 단품. 콤보 매칭은 bare K100/L100 보다 먼저 평가해야 함.
// 수량은 우리 memo 포맷 ("용역 도어락 설치비(K100)+월패드 연동(RF447) x1 / ...") 기준으로 정규식 적용
// ============================================================

const COMBO_L100_KEY = '용역 도어락 설치비(L100)+월패드 연동(RF447)'
const COMBO_K100_KEY = '용역 도어락 설치비(K100)+월패드 연동(RF447)'

export function determineItem(memo: string): { itemCode: string | null; itemName: string | null; quantity: number | null } {
  const hasComboL100 = memo.includes(COMBO_L100_KEY)
  const hasComboK100 = memo.includes(COMBO_K100_KEY)
  const hasL100 = memo.includes('L100')
  const hasK100 = memo.includes('K100')
  const hasU100 = memo.includes('U100')

  // qtyMatch: 콤보의 "설치비(K100)+월패드 연동(RF447) x1" 도 [^\/]* 로 인해 동일하게 매칭됨
  const qtyMatch = memo.match(/설치비\s*\([KLU]100\)[^\/]*x\s*(\d+)/i) ||
                   memo.match(/[KLU]100[^\/\n]*?x\s*(\d+)/i)
  const quantity = qtyMatch ? Number(qtyMatch[1]) : null

  // 콤보 (월패드 연동) 우선 — bare K100/L100 보다 먼저 평가
  if (hasComboL100) return { itemCode: '00048', itemName: 'L100도어락설치+월패드연동설치', quantity }
  if (hasComboK100) return { itemCode: '00049', itemName: 'K100도어락설치+월패드연동설치', quantity }
  if (hasL100)      return { itemCode: '00047', itemName: 'L100도어락설치',                  quantity }
  if (hasK100)      return { itemCode: '00050', itemName: 'K100도어락설치',                  quantity }
  if (hasU100)      return { itemCode: '00051', itemName: 'U100도어락 설치',                 quantity }
  return { itemCode: null, itemName: null, quantity }
}

// ============================================================
// 데이터 조회 + 분배 파이프라인
// ============================================================

/**
 * 기사배정 대상 주문 조회 (ERP)
 * - 납기일자 (DT_DUEDATE) 범위 매칭
 * - 해당 주문(NO_SO)에 용역 품목(00010 출장비 / 00012% 도어락 설치비) 포함
 * - 전화번호 기준 그룹핑 (한 사람 = 한 행)
 * @param dueDateFrom YYYYMMDD (포함)
 * @param dueDateTo   YYYYMMDD (포함)
 */
export async function fetchDispatchRows(dueDateFrom: string, dueDateTo: string): Promise<DispatchRow[]> {
  const pool = await getErpPool()
  const result = await pool.request()
    .input('dueDateFrom', sql.VarChar(8), dueDateFrom)
    .input('dueDateTo',   sql.VarChar(8), dueDateTo)
    .query(`
      WITH eligible AS (
        SELECT DISTINCT SOL.NO_SO, SOL.CD_COMPANY
        FROM NEOE.SA_SOL SOL
        WHERE SOL.CD_COMPANY = '1000'
          AND SOL.NO_HST     = 0
          AND SOL.DT_DUEDATE BETWEEN @dueDateFrom AND @dueDateTo
          AND (SOL.CD_ITEM = '00010' OR SOL.CD_ITEM LIKE '00012%')
          -- 출하의뢰가 1건 이상 존재하고, 모든 SA_GIRL 라인이 QT_GIR = QT_GI 인 주문만
          AND EXISTS (
            SELECT 1 FROM NEOE.SA_GIRL G
            WHERE G.NO_SO = SOL.NO_SO AND G.CD_COMPANY = SOL.CD_COMPANY
          )
          AND NOT EXISTS (
            SELECT 1 FROM NEOE.SA_GIRL G
            WHERE G.NO_SO = SOL.NO_SO AND G.CD_COMPANY = SOL.CD_COMPANY
              AND G.QT_GIR <> G.QT_GI
          )
      ),
      lines AS (
        SELECT
          SOL.NO_SO, SOL.SEQ_SO, SOL.CD_COMPANY,
          SOL.CD_ITEM,
          LTRIM(RTRIM(ISNULL(I.NM_ITEM, SOL.CD_ITEM))) AS NM_ITEM,
          CAST(SOL.QT_SO AS INT) AS QT,
          SOL.NO_ORDER_ON,
          G.NO_GIR AS no_girl,
          SOL.DT_DUEDATE AS due_date,
          COALESCE(
            NULLIF(LTRIM(RTRIM(CZ.NO_HP2)),  ''),    -- 수령인 휴대폰 (우선)
            NULLIF(LTRIM(RTRIM(CZ.NO_HP1)),  ''),    -- 구매자 휴대폰 (대체)
            NULLIF(LTRIM(RTRIM(CZ.NO_TEL2)), ''),    -- 수령인 일반전화
            NULLIF(LTRIM(RTRIM(CZ.NO_TEL1)), ''),    -- 구매자 일반전화
            NULLIF(LTRIM(RTRIM(DLV.NO_TEL_D1)), ''),  -- 배송지 전화 1 (SA_SOL_DLV)
            NULLIF(LTRIM(RTRIM(DLV.NO_TEL_D2)), ''),  -- 배송지 전화 2 (SA_SOL_DLV)
            NULLIF(LTRIM(RTRIM(DLV.NO_TEL1)), ''),    -- 주문자 전화 1 (SA_SOL_DLV)
            NULLIF(LTRIM(RTRIM(DLV.NO_TEL2)), '')     -- 주문자 전화 2 (SA_SOL_DLV)
          ) AS phone,
          COALESCE(
            NULLIF(LTRIM(RTRIM(CZ.NM_RECEIVE)), ''),
            NULLIF(LTRIM(RTRIM(CZ.NM_CUST)),    ''),
            NULLIF(LTRIM(RTRIM(DLV.NM_CUST_DLV)), ''), -- 수령인명 (SA_SOL_DLV)
            NULLIF(LTRIM(RTRIM(DLV.NM_CUST)), '')      -- 주문자명 (SA_SOL_DLV)
          ) AS nm,
          COALESCE(
            NULLIF(LTRIM(RTRIM(CZ.DC_ADDR1)), ''),
            NULLIF(LTRIM(RTRIM(ISNULL(DLV.ADDR1, '') + ' ' + ISNULL(DLV.ADDR2, ''))), '')
          ) AS addr,
          CZ.PRODUCT_NAME AS product_name
        FROM eligible e
        JOIN NEOE.SA_SOL SOL
          ON SOL.NO_SO = e.NO_SO AND SOL.CD_COMPANY = e.CD_COMPANY
         AND SOL.NO_HST = 0
        LEFT JOIN (
          SELECT NO_SO, SEQ_SO, CD_COMPANY, MAX(NO_GIR) AS NO_GIR
          FROM NEOE.SA_GIRL
          GROUP BY NO_SO, SEQ_SO, CD_COMPANY
        ) G
          ON G.NO_SO = SOL.NO_SO
         AND G.SEQ_SO = SOL.SEQ_SO
         AND G.CD_COMPANY = SOL.CD_COMPANY
        LEFT JOIN NEOE.CZ_SA_ORDER CZ
          ON CZ.NO_ORDER  = SOL.NO_SO
         AND CZ.SEQ_ORDER = SOL.SEQ_SO
         AND CZ.CD_COMPANY = SOL.CD_COMPANY
        LEFT JOIN NEOE.SA_SOL_DLV DLV
          ON DLV.NO_SO = SOL.NO_SO
         AND DLV.SEQ_SO = SOL.SEQ_SO
         AND DLV.CD_COMPANY = SOL.CD_COMPANY
        LEFT JOIN NEOE.MA_PITEM I
          ON I.CD_ITEM = SOL.CD_ITEM AND I.CD_COMPANY = '1000'

        UNION ALL

        -- CZ_PU_INOUT_CONF 에서 직접 가져오는 내부/인플루언서 단
        SELECT
          CONF.NO_RCV AS NO_SO,
          CONF.NO_LINE AS SEQ_SO,
          CONF.CD_COMPANY,
          CONF.CD_ITEM,
          LTRIM(RTRIM(ISNULL(I.NM_ITEM, CONF.CD_ITEM))) AS NM_ITEM,
          CAST(CONF.QT_RCV AS INT) AS QT,
          NULL AS NO_ORDER_ON, -- 내부단은 쇼핑몰 주문번호가 없음
          CONF.NO_RCV AS no_girl, -- 내부단은 NO_RCV가 NO_GIRL임
          CONF.DT_RCV AS due_date,
          COALESCE(
            NULLIF(LTRIM(RTRIM(CONF.NO_HP2)), ''),
            NULLIF(LTRIM(RTRIM(CONF.NO_TEL2)), ''),
            NULLIF(LTRIM(RTRIM(CONF.NO_HP1)), ''),
            NULLIF(LTRIM(RTRIM(CONF.NO_TEL1)), '')
          ) AS phone,
          CONF.NM_CUST AS nm,
          CONF.DC_ADDR1 AS addr,
          CONF.DC_RMK_ORDER AS product_name
        FROM NEOE.CZ_PU_INOUT_CONF CONF
        LEFT JOIN NEOE.MA_PITEM I
          ON I.CD_ITEM = CONF.CD_ITEM AND I.CD_COMPANY = '1000'
        WHERE CONF.CD_COMPANY = '1000'
          AND CONF.DT_RCV BETWEEN @dueDateFrom AND @dueDateTo
          AND CONF.CD_STAT = '02'
          AND NOT EXISTS (
            SELECT 1 FROM NEOE.SA_GIRL G
            WHERE G.NO_GIR = CONF.NO_RCV AND G.CD_COMPANY = CONF.CD_COMPANY
          )
          AND EXISTS (
            SELECT 1 FROM NEOE.CZ_PU_INOUT_CONF C2
            WHERE C2.NO_RCV = CONF.NO_RCV AND C2.CD_COMPANY = CONF.CD_COMPANY
              AND (C2.CD_ITEM = '00010' OR C2.CD_ITEM LIKE '00012%')
          )
      )
      SELECT
        MAX(nm)        AS customer_name,
        l1.phone       AS phone,
        MAX(addr)      AS address,
        MIN(due_date)  AS due_date,
        STUFF((
          SELECT DISTINCT N', ' + l2.NO_ORDER_ON
          FROM lines l2
          WHERE l2.phone = l1.phone
            AND l2.NO_ORDER_ON IS NOT NULL
            -- 용역 라인이 속한 NO_ORDER_ON 만 (일반 상품의 NO_ORDER_ON 제외)
            AND (l2.CD_ITEM = '00010' OR l2.CD_ITEM LIKE '00012%')
          FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS order_numbers,
        STUFF((
          SELECT DISTINCT N', ' + l2.no_girl
          FROM lines l2
          WHERE l2.phone = l1.phone
            AND l2.no_girl IS NOT NULL
          FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS no_girl,
        COALESCE(
          (SELECT TOP 1 N'[잇섭PICK_앱 설치] ' FROM lines l2 WHERE l2.phone = l1.phone AND CHARINDEX(N'[잇섭PICK]', l2.product_name) > 0),
          (SELECT TOP 1 N'[지니스펙트럼PICK_앱 설치] ' FROM lines l2 WHERE l2.phone = l1.phone AND CHARINDEX(N'[지니스펙트럼PICK]', l2.product_name) > 0),
          (SELECT TOP 1 N'[스마트홈 여름 준비 패키지_앱+허브 설치] ' FROM lines l2 WHERE l2.phone = l1.phone AND CHARINDEX(N'스마트홈 여름 준비 패키지 (도어락 L100+안심설치+에어컨 제어)', l2.product_name) > 0),
          N''
        ) + 
        STUFF((
          SELECT N' / ' + l2.NM_ITEM + N' x' + CAST(l2.QT AS NVARCHAR(10))
          FROM lines l2
          WHERE l2.phone = l1.phone
          ORDER BY 
            CASE 
              WHEN (l2.CD_ITEM = '00010' OR l2.CD_ITEM LIKE '00012%' OR l2.NM_ITEM LIKE '%용역%') THEN 3
              WHEN l2.NM_ITEM LIKE '%도어락%' THEN 1
              ELSE 2
            END,
            l2.SEQ_SO
          FOR XML PATH(''), TYPE
        ).value('.', 'NVARCHAR(MAX)'), 1, 3, '') AS memo
      FROM lines l1
      WHERE l1.phone IS NOT NULL
      GROUP BY l1.phone
      ORDER BY MIN(due_date), customer_name
    `)

  return result.recordset as DispatchRow[]
}

/**
 * 조회된 행에 설치기사 매칭 + 품목 정보를 채워서 반환.
 *
 * 균등 분배 (배치 내 round-robin):
 *   - 한 주소에 동점 후보 N 명이 있으면, 본 배치 내에서 1→2→...→N→1 순으로 순환.
 *   - 동일 후보 set 마다 별도 카운터 (key = businessNumber 시퀀스).
 *   - 배치 간에는 stateless (매 호출마다 0 부터). API 가 하루 1 번 호출되는
 *     사용 패턴이라 장기적으로도 자연스럽게 균등화.
 */
export function assignDispatch(rows: DispatchRow[]): DispatchAssignment[] {
  // key: candidates 의 businessNumber 시퀀스 (동점 그룹 식별자)
  // val: 다음 라운드에 선택할 후보 index
  const tieRotation = new Map<string, number>()

  return rows.map(row => {
    const item = determineItem(row.memo ?? '')
    const isU100 = (row.memo ?? '').includes('U100')

    let inst: Installer
    if (isU100) {
      inst = DEFAULT_INSTALLER
    } else {
      const candidates = matchInstallerCandidates(row.address ?? '')
      if (candidates.length <= 1) {
        inst = candidates[0]
      } else {
        const key = candidates.map(c => c.businessNumber).join('|')
        const next = tieRotation.get(key) ?? 0
        inst = candidates[next % candidates.length]
        tieRotation.set(key, next + 1)
      }
    }

    return {
      ...row,
      business_number: inst.businessNumber,
      branch_name:     inst.branchName,
      item_code:       item.itemCode,
      item_name:       item.itemName,
      quantity:        item.quantity,
    }
  })
}
