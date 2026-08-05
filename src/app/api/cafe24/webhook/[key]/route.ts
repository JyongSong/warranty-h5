import { NextResponse } from "next/server";
import { cafe24SecretMatches, handleCafe24Webhook } from "../handler";

/**
 * 生产入口：secret 作为 URL 路径段传入。
 *
 * Cafe24 后台的 webhook 接收 URL 不接受 query string（`?key=` 会报「URL 형식」错误），
 * 但接受纯路径。因此在 Cafe24 把接收 URL 配成：
 *   https://www.aqaralife-service.kr/api/cafe24/webhook/<CAFE24_WEBHOOK_SECRET>
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!cafe24SecretMatches(key)) {
    console.warn("[Cafe24 Webhook] 拒绝未授权请求（路径 key 缺失或不匹配）。");
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  return handleCafe24Webhook(req);
}
