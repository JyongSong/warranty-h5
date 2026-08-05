import { NextResponse } from "next/server";
import { cafe24SecretMatches, handleCafe24Webhook } from "./handler";

/**
 * 兼容入口：secret 也可放在 `?key=` query 或 `x-cafe24-webhook-key` header。
 *
 * 注意：Cafe24 后台的 webhook 接收 URL 不接受 query string，所以生产环境请用
 * 路径段方式 `/api/cafe24/webhook/<secret>`（见 `[key]/route.ts`）。本入口保留
 * 用于其它网关/手动测试。
 */
export function extractProvidedKey(req: Request): string | null {
  return (
    new URL(req.url).searchParams.get("key") ||
    req.headers.get("x-cafe24-webhook-key")
  );
}

export async function POST(req: Request) {
  if (!cafe24SecretMatches(extractProvidedKey(req))) {
    console.warn("[Cafe24 Webhook] 拒绝未授权请求（key 缺失或不匹配）。");
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  return handleCafe24Webhook(req);
}
