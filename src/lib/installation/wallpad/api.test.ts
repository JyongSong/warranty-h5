import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const svc = vi.hoisted(() => ({
  getWallpadCompatData: vi.fn(),
  getPublicWallpadCompatData: vi.fn(),
  saveWallpadModel: vi.fn(),
  saveWallpadCase: vi.fn(),
  saveWallpadNote: vi.fn(),
  deleteWallpadModel: vi.fn(),
  deleteWallpadCase: vi.fn(),
  deleteWallpadNote: vi.fn(),
}));

vi.mock("./service", async () => {
  class WallpadCompatError extends Error {}
  return { ...svc, WallpadCompatError };
});

import { Prisma } from "@prisma/client";
import { GET, OPTIONS } from "@/app/api/wallpad/route";
import { POST } from "@/app/api/wallpad/[kind]/route";
import { DELETE, PUT } from "@/app/api/wallpad/[kind]/[id]/route";
import { WallpadCompatError } from "./service";

const KEY = "test-wallpad-key";
const ORIGIN = "https://smarttools-lab-sy.github.io";

function req(method: string, opts: { key?: string; origin?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.key) headers.authorization = `Bearer ${opts.key}`;
  if (opts.origin) headers.origin = opts.origin;
  return new Request("http://localhost/api/wallpad", {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

const kind = (k: string) => ({ params: Promise.resolve({ kind: k }) });
const kindId = (k: string, id: string) => ({ params: Promise.resolve({ kind: k, id }) });

beforeEach(() => {
  vi.stubEnv("WALLPAD_API_KEY", KEY);
  vi.stubEnv("WALLPAD_API_ALLOWED_ORIGINS", "");
  svc.getPublicWallpadCompatData.mockResolvedValue({ models: [], cases: [], notes: [] });
  svc.getWallpadCompatData.mockResolvedValue({ models: [], cases: [], notes: [] });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/wallpad", () => {
  it("키 없이는 공개(가린) 데이터를 돌려준다", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect((await res.json()).scope).toBe("public");
    expect(svc.getPublicWallpadCompatData).toHaveBeenCalled();
    expect(svc.getWallpadCompatData).not.toHaveBeenCalled();
  });

  it("올바른 키면 전체 데이터, 틀린 키면 공개 데이터", async () => {
    expect((await (await GET(req("GET", { key: KEY }))).json()).scope).toBe("full");
    expect((await (await GET(req("GET", { key: "wrong" }))).json()).scope).toBe("public");
  });

  it("서버에 키가 없으면 어떤 토큰도 전체 데이터를 열지 못한다", async () => {
    vi.stubEnv("WALLPAD_API_KEY", "");
    expect((await (await GET(req("GET", { key: "" }))).json()).scope).toBe("public");
  });
});

describe("CORS", () => {
  it("허용한 출처에만 Allow-Origin 을 붙인다", async () => {
    const ok = await GET(req("GET", { origin: ORIGIN }));
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    const other = await GET(req("GET", { origin: "https://evil.example" }));
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("사전 요청에 Authorization 헤더를 허용한다", async () => {
    const res = OPTIONS(req("OPTIONS", { origin: ORIGIN }));
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-headers")).toContain("Authorization");
  });
});

describe("쓰기", () => {
  it("키 없으면 401, 저장하지 않는다", async () => {
    const res = await POST(req("POST", { body: { brand: "코콤" } }), kind("models"));
    expect(res.status).toBe(401);
    expect(svc.saveWallpadModel).not.toHaveBeenCalled();
  });

  it("POST 는 새로 만들고 id 를 돌려준다(본문의 id 는 무시)", async () => {
    svc.saveWallpadCase.mockResolvedValue("case-9");
    const res = await POST(
      req("POST", { key: KEY, body: { id: "hijack", siteName: "A단지", result: "SUCCESS" } }),
      kind("cases"),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, id: "case-9" });
    expect(svc.saveWallpadCase).toHaveBeenCalledWith(
      expect.objectContaining({ id: null, siteName: "A단지" }),
      null,
    );
  });

  it("PUT 은 경로의 id 로 고친다", async () => {
    svc.saveWallpadNote.mockResolvedValue("n1");
    const res = await PUT(req("PUT", { key: KEY, body: { kind: "BRAND", title: "t", note: "n" } }), kindId("notes", "n1"));
    expect(res.status).toBe(200);
    expect(svc.saveWallpadNote).toHaveBeenCalledWith(expect.objectContaining({ id: "n1" }));
  });

  it("검증 오류는 400, 모델 중복은 409, 없는 id 는 404", async () => {
    svc.saveWallpadModel.mockRejectedValueOnce(new WallpadCompatError("VERDICT_INVALID"));
    expect((await POST(req("POST", { key: KEY, body: {} }), kind("models"))).status).toBe(400);

    svc.saveWallpadModel.mockRejectedValueOnce(new WallpadCompatError("MODEL_DUPLICATE"));
    expect((await POST(req("POST", { key: KEY, body: {} }), kind("models"))).status).toBe(409);

    svc.deleteWallpadCase.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("not found", { code: "P2025", clientVersion: "x" }),
    );
    expect((await DELETE(req("DELETE", { key: KEY }), kindId("cases", "nope"))).status).toBe(404);
  });

  it("모르는 종류는 404, JSON 이 아니면 400", async () => {
    expect((await POST(req("POST", { key: KEY, body: {} }), kind("orders"))).status).toBe(404);
    const bad = new Request("http://localhost/api/wallpad/models", {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}` },
      body: "not json",
    });
    expect((await POST(bad, kind("models"))).status).toBe(400);
  });

  it("DELETE 는 키가 있어야 지운다", async () => {
    expect((await DELETE(req("DELETE"), kindId("models", "m1"))).status).toBe(401);
    expect((await DELETE(req("DELETE", { key: KEY }), kindId("models", "m1"))).status).toBe(200);
    expect(svc.deleteWallpadModel).toHaveBeenCalledWith("m1");
  });
});
