import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  WallpadCompatError,
  deleteWallpadCase,
  deleteWallpadModel,
  deleteWallpadNote,
  saveWallpadCase,
  saveWallpadModel,
  saveWallpadNote,
  type WallpadCaseInput,
  type WallpadModelInput,
  type WallpadNoteInput,
} from "./service";

// 월패드 호환 데이터 API(/api/wallpad) 공통 처리.
// - 읽기: 키 없이 누구나(공개 조회 페이지와 같은 가린 데이터). 올바른 키를 붙이면 주소까지 전체.
// - 쓰기: WALLPAD_API_KEY 를 "Authorization: Bearer <키>" 로 보내야 한다.
// - 브라우저에서 부르는 곳(동료의 조회 페이지)은 WALLPAD_API_ALLOWED_ORIGINS 로 허용한다.

const DEFAULT_ALLOWED_ORIGINS = ["https://smarttools-lab-sy.github.io"];

function allowedOrigins(): string[] {
  const raw = process.env.WALLPAD_API_ALLOWED_ORIGINS?.trim();
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function corsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin", "Cache-Control": "no-store" };
  const origin = req.headers.get("origin");
  if (origin && allowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

export function json(req: Request, body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: corsHeaders(req) });
}

export function preflight(req: Request): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

/** 키가 서버에 설정돼 있고 요청의 Bearer 토큰과 같을 때만 true. */
export function hasWallpadApiKey(req: Request): boolean {
  const expected = process.env.WALLPAD_API_KEY?.trim();
  if (!expected) return false;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ─── 쓰기 ────────────────────────────────────────────────────────────────

export const WALLPAD_API_KINDS = ["models", "cases", "notes"] as const;
export type WallpadApiKind = (typeof WALLPAD_API_KINDS)[number];

export function isWallpadApiKind(value: string): value is WallpadApiKind {
  return (WALLPAD_API_KINDS as readonly string[]).includes(value);
}

function save(kind: WallpadApiKind, input: Record<string, unknown>): Promise<string> {
  // API 입력은 관리자 계정이 없으므로 작성자 id 는 비워 둔다.
  if (kind === "models") return saveWallpadModel(input as unknown as WallpadModelInput, null);
  if (kind === "cases") return saveWallpadCase(input as unknown as WallpadCaseInput, null);
  return saveWallpadNote(input as unknown as WallpadNoteInput);
}

function remove(kind: WallpadApiKind, id: string): Promise<void> {
  if (kind === "models") return deleteWallpadModel(id);
  if (kind === "cases") return deleteWallpadCase(id);
  return deleteWallpadNote(id);
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

function errorResponse(req: Request, error: unknown): NextResponse {
  if (error instanceof WallpadCompatError) {
    const status = error.message === "MODEL_DUPLICATE" ? 409 : 400;
    return json(req, { error: error.message }, status);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return json(req, { error: "NOT_FOUND" }, 404);
  }
  console.error("[api/wallpad]", error);
  return json(req, { error: "SAVE_FAILED" }, 500);
}

/**
 * 만들기(id 없음) 또는 통째로 고치기(id 있음). 고칠 때는 빠진 항목이 비워지므로
 * 키를 붙여 읽은 전체 데이터를 고쳐서 보낸다.
 */
export async function handleWallpadWrite(
  req: Request,
  kindParam: string,
  id: string | null,
): Promise<NextResponse> {
  if (!hasWallpadApiKey(req)) return json(req, { error: "UNAUTHORIZED" }, 401);
  if (!isWallpadApiKind(kindParam)) return json(req, { error: "NOT_FOUND" }, 404);

  const body = await readBody(req);
  if (!body) return json(req, { error: "INVALID_JSON" }, 400);

  try {
    const savedId = await save(kindParam, { ...body, id });
    return json(req, { ok: true, id: savedId }, id ? 200 : 201);
  } catch (error) {
    return errorResponse(req, error);
  }
}

export async function handleWallpadDelete(req: Request, kindParam: string, id: string): Promise<NextResponse> {
  if (!hasWallpadApiKey(req)) return json(req, { error: "UNAUTHORIZED" }, 401);
  if (!isWallpadApiKind(kindParam)) return json(req, { error: "NOT_FOUND" }, 404);
  try {
    await remove(kindParam, id);
    return json(req, { ok: true });
  } catch (error) {
    return errorResponse(req, error);
  }
}
