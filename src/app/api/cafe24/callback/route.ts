import { NextResponse } from "next/server";
import { getInitialTokens } from "@/lib/cafe24";
import { getErrorMessage } from "@/lib/error";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const mallId = searchParams.get("mall_id");

    if (!code || !mallId) {
      return NextResponse.json(
        { error: "CODE_OR_MALL_ID_MISSING", message: "code 및 mall_id 파라미터가 누락되었습니다." },
        { status: 400 }
      );
    }

    // 调用 Token 交换函数
    await getInitialTokens(mallId, code);

    // 返回授权成功的简单提示页面
    return new NextResponse(
      `
      <!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8">
        <title>Cafe24 연동 성공</title>
        <style>
          body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background-color: #f7fee7; }
          .card { text-align: center; background: white; padding: 40px; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #d9f99d; }
          h1 { color: #166534; margin-top: 0; }
          p { color: #3f6212; line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Cafe24 연동 성공!</h1>
          <p>쇼핑몰 연동이 완료되었습니다.<br>이제 결제 완료 시 자동으로 기기가 활성화됩니다.</p>
        </div>
      </body>
      </html>
      `,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (error: unknown) {
    console.error("Cafe24 OAuth callback error:", error);
    return NextResponse.json(
      { error: "OAUTH_CALLBACK_FAILED", message: getErrorMessage(error, "연동 처리 중 오류가 발생했습니다.") },
      { status: 500 }
    );
  }
}
