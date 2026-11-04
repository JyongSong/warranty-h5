import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptNullablePii } from "@/lib/piiCrypto";
import { geocodeBuildingName } from "@/lib/installation/distance/naver";
import {
  WALLPAD_CASE_RESULTS,
  WALLPAD_FAIL_REASONS,
  WALLPAD_NOTE_KINDS,
  WALLPAD_VERDICTS,
  isOneOf,
  type WallpadCaseResult,
  type WallpadCaseSource,
  type WallpadNoteKind,
  type WallpadVerdict,
} from "./constants";
import { siteNameFromAddress, wallpadModelKey, wallpadSiteAddress, wallpadSiteKey } from "./normalize";

export class WallpadCompatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WallpadCompatError";
  }
}

type Tx = Prisma.TransactionClient;

function trimOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// ─── 완료 등록 → 현장 사례 ───────────────────────────────────────────────

/**
 * 승인된 완료 등록의 월패드 연동 결과를 현장 사례로 남긴다. approveInstallerCompletion 의 트랜잭션 안에서 부른다.
 * 성공·실패만 남기고(연동 안 함·옛 제출은 건너뜀), 주문 하나에 사례 하나다.
 *
 * 단지명은 주소의 "(동, 아파트명)" 에서 꺼내고, 없으면 일단 도로명 주소를 넣어 둔다.
 * 네이버 건물명 조회는 트랜잭션 밖에서 fillCompletionCaseSiteName 이 한다.
 * 돌려주는 값은 건물명 조회가 필요한 사례의 id 다.
 */
export async function recordCompletionWallpadCase(tx: Tx, orderId: string): Promise<string | null> {
  const order = await tx.installationOrder.findUnique({
    where: { id: orderId },
    select: {
      completion: {
        select: {
          wallpadResult: true,
          wallpadBrand: true,
          wallpadModel: true,
          wallpadFailReason: true,
          wallpadNote: true,
          installEndAt: true,
        },
      },
      activeCustomerRequest: { select: { installAddressEncrypted: true, installAddress1Encrypted: true } },
      source: { select: { addressEncrypted: true } },
    },
  });
  const completion = order?.completion;
  if (!completion || (completion.wallpadResult !== "SUCCESS" && completion.wallpadResult !== "FAIL")) {
    return null;
  }

  const address =
    decryptNullablePii(order.activeCustomerRequest?.installAddressEncrypted) ??
    decryptNullablePii(order.activeCustomerRequest?.installAddress1Encrypted) ??
    decryptNullablePii(order.source?.addressEncrypted);
  const siteAddress = wallpadSiteAddress(address);
  const nameFromAddress = siteNameFromAddress(address);

  const data = {
    siteName: nameFromAddress ?? siteAddress ?? "(주소 미확인)",
    siteKey: wallpadSiteKey(siteAddress),
    siteAddress,
    brand: completion.wallpadBrand,
    model: completion.wallpadModel,
    result: completion.wallpadResult,
    failReason: completion.wallpadResult === "FAIL" ? completion.wallpadFailReason : null,
    note: completion.wallpadNote,
    source: "COMPLETION" satisfies WallpadCaseSource,
    occurredOn: kstDate(completion.installEndAt),
  };
  const saved = await tx.wallpadSiteCase.upsert({
    where: { installationOrderId: orderId },
    create: { ...data, installationOrderId: orderId },
    update: data,
    select: { id: true },
  });
  return !nameFromAddress && siteAddress ? saved.id : null;
}

/** 도로명 주소로만 남긴 사례의 단지명을 네이버 건물명으로 바꾼다. 실패해도 승인에는 영향이 없다. */
export async function fillCompletionCaseSiteName(caseId: string): Promise<void> {
  try {
    const row = await prisma.wallpadSiteCase.findUnique({
      where: { id: caseId },
      select: { siteName: true, siteAddress: true },
    });
    if (!row?.siteAddress || row.siteName !== row.siteAddress) return;
    const name = await geocodeBuildingName(row.siteAddress);
    if (!name) return;
    await prisma.wallpadSiteCase.update({ where: { id: caseId }, data: { siteName: name } });
  } catch (error) {
    console.error("[wallpad/site-name]", error);
  }
}

function kstDate(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ─── 화면 데이터 ─────────────────────────────────────────────────────────

export type WallpadModelRow = {
  id: string;
  brand: string;
  model: string;
  aliases: string[];
  verdict: WallpadVerdict;
  note: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
  verifiedOn: string | null;
  updatedAt: string;
};

export type WallpadCaseRow = {
  id: string;
  siteName: string;
  siteKey: string | null;
  siteAddress: string | null;
  brand: string | null;
  model: string | null;
  result: WallpadCaseResult;
  failReason: string | null;
  note: string | null;
  source: WallpadCaseSource;
  sourceUrl: string | null;
  installationOrderId: string | null;
  occurredOn: string | null;
  createdAt: string;
};

export type WallpadNoteRow = {
  id: string;
  kind: WallpadNoteKind;
  title: string;
  keywords: string[];
  note: string;
  sourceType: string | null;
  reportedOn: string | null;
};

export async function getWallpadCompatData(): Promise<{
  models: WallpadModelRow[];
  cases: WallpadCaseRow[];
  notes: WallpadNoteRow[];
}> {
  const [models, cases, notes] = await Promise.all([
    prisma.wallpadModel.findMany({ orderBy: [{ brand: "asc" }, { model: "asc" }] }),
    prisma.wallpadSiteCase.findMany({ orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }] }),
    prisma.wallpadCompatNote.findMany({ orderBy: [{ kind: "asc" }, { createdAt: "asc" }] }),
  ]);

  return {
    models: models.map((m) => ({
      id: m.id,
      brand: m.brand,
      model: m.model,
      aliases: m.aliases,
      verdict: (isOneOf(WALLPAD_VERDICTS, m.verdict) ? m.verdict : "UNVERIFIED") as WallpadVerdict,
      note: m.note,
      sourceType: m.sourceType,
      sourceUrl: m.sourceUrl,
      verifiedOn: m.verifiedOn,
      updatedAt: m.updatedAt.toISOString(),
    })),
    cases: cases.map((c) => ({
      id: c.id,
      siteName: c.siteName,
      siteKey: c.siteKey,
      siteAddress: c.siteAddress,
      brand: c.brand,
      model: c.model,
      result: c.result as WallpadCaseResult,
      failReason: c.failReason,
      note: c.note,
      source: c.source as WallpadCaseSource,
      sourceUrl: c.sourceUrl,
      installationOrderId: c.installationOrderId,
      occurredOn: c.occurredOn,
      createdAt: c.createdAt.toISOString(),
    })),
    notes: notes.map((n) => ({
      id: n.id,
      kind: n.kind as WallpadNoteKind,
      title: n.title,
      keywords: n.keywords,
      note: n.note,
      sourceType: n.sourceType,
      reportedOn: n.reportedOn,
    })),
  };
}

/** 기사 완료 등록 화면의 모델명 자동완성 목록. */
export async function listWallpadModelNames(): Promise<Array<{ brand: string; model: string }>> {
  try {
    return await prisma.wallpadModel.findMany({
      select: { brand: true, model: true },
      orderBy: [{ brand: "asc" }, { model: "asc" }],
    });
  } catch (error) {
    // 테이블이 아직 없거나 조회가 실패해도 완료 등록은 막지 않는다. 자동완성만 빠진다.
    console.error("[wallpad/model-names]", error);
    return [];
  }
}

// ─── 관리자 입력 ─────────────────────────────────────────────────────────

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function optionalDate(value: unknown): string | null {
  const text = trimOrNull(value);
  if (!text) return null;
  if (!DATE_PATTERN.test(text)) throw new WallpadCompatError("DATE_INVALID");
  return text;
}

function splitList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return Array.from(new Set(items.map((item) => String(item).trim()).filter(Boolean)));
}

export type WallpadModelInput = {
  id?: string | null;
  brand: string;
  model: string;
  aliases?: string[] | string;
  verdict: string;
  note?: string | null;
  sourceType?: string | null;
  sourceUrl?: string | null;
  verifiedOn?: string | null;
};

export async function saveWallpadModel(input: WallpadModelInput, adminId: string): Promise<void> {
  const brand = trimOrNull(input.brand);
  const model = trimOrNull(input.model);
  if (!brand) throw new WallpadCompatError("BRAND_REQUIRED");
  if (!model) throw new WallpadCompatError("MODEL_REQUIRED");
  if (!isOneOf(WALLPAD_VERDICTS, input.verdict)) throw new WallpadCompatError("VERDICT_INVALID");

  const modelKey = wallpadModelKey(model);
  const duplicate = await prisma.wallpadModel.findUnique({ where: { modelKey }, select: { id: true } });
  if (duplicate && duplicate.id !== input.id) throw new WallpadCompatError("MODEL_DUPLICATE");

  const data = {
    brand,
    model,
    modelKey,
    aliases: splitList(input.aliases),
    verdict: input.verdict,
    note: trimOrNull(input.note),
    sourceType: trimOrNull(input.sourceType),
    sourceUrl: trimOrNull(input.sourceUrl),
    verifiedOn: optionalDate(input.verifiedOn),
    updatedByAdminId: adminId,
  };
  if (input.id) {
    await prisma.wallpadModel.update({ where: { id: input.id }, data });
  } else {
    await prisma.wallpadModel.create({ data });
  }
}

export async function deleteWallpadModel(id: string): Promise<void> {
  await prisma.wallpadModel.delete({ where: { id } });
}

export type WallpadCaseInput = {
  id?: string | null;
  siteName: string;
  siteAddress?: string | null;
  brand?: string | null;
  model?: string | null;
  result: string;
  failReason?: string | null;
  note?: string | null;
  sourceUrl?: string | null;
  occurredOn?: string | null;
};

/**
 * 관리자가 현장 사례를 넣거나 고친다. 완료 등록에서 온 사례도 고칠 수 있다(단지명·모델명 정정).
 * 주소를 적으면 도로명+건물번호까지만 남겨 같은 단지 사례와 묶는다.
 */
export async function saveWallpadCase(input: WallpadCaseInput, adminId: string): Promise<void> {
  const siteName = trimOrNull(input.siteName);
  if (!siteName) throw new WallpadCompatError("SITE_NAME_REQUIRED");
  if (!isOneOf(WALLPAD_CASE_RESULTS, input.result)) throw new WallpadCompatError("RESULT_INVALID");
  const failReason = input.result === "FAIL" ? trimOrNull(input.failReason) : null;
  if (failReason && !isOneOf(WALLPAD_FAIL_REASONS, failReason)) {
    throw new WallpadCompatError("FAIL_REASON_INVALID");
  }

  const rawAddress = trimOrNull(input.siteAddress);
  const siteAddress = rawAddress ? (wallpadSiteAddress(rawAddress) ?? rawAddress) : null;
  const data = {
    siteName,
    siteAddress,
    siteKey: wallpadSiteKey(siteAddress),
    brand: trimOrNull(input.brand),
    model: trimOrNull(input.model),
    result: input.result,
    failReason,
    note: trimOrNull(input.note),
    sourceUrl: trimOrNull(input.sourceUrl),
    occurredOn: optionalDate(input.occurredOn),
  };
  if (input.id) {
    await prisma.wallpadSiteCase.update({ where: { id: input.id }, data });
  } else {
    await prisma.wallpadSiteCase.create({
      data: { ...data, source: "ADMIN" satisfies WallpadCaseSource, createdByAdminId: adminId },
    });
  }
}

export async function deleteWallpadCase(id: string): Promise<void> {
  await prisma.wallpadSiteCase.delete({ where: { id } });
}

export type WallpadNoteInput = {
  id?: string | null;
  kind: string;
  title: string;
  keywords?: string[] | string;
  note: string;
  sourceType?: string | null;
  reportedOn?: string | null;
};

export async function saveWallpadNote(input: WallpadNoteInput): Promise<void> {
  if (!isOneOf(WALLPAD_NOTE_KINDS, input.kind)) throw new WallpadCompatError("KIND_INVALID");
  const title = trimOrNull(input.title);
  const note = trimOrNull(input.note);
  if (!title) throw new WallpadCompatError("TITLE_REQUIRED");
  if (!note) throw new WallpadCompatError("NOTE_REQUIRED");

  const data = {
    kind: input.kind,
    title,
    keywords: splitList(input.keywords),
    note,
    sourceType: trimOrNull(input.sourceType),
    reportedOn: optionalDate(input.reportedOn),
  };
  if (input.id) {
    await prisma.wallpadCompatNote.update({ where: { id: input.id }, data });
  } else {
    await prisma.wallpadCompatNote.create({ data });
  }
}

export async function deleteWallpadNote(id: string): Promise<void> {
  await prisma.wallpadCompatNote.delete({ where: { id } });
}
