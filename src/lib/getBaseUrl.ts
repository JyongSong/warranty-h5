// src/lib/getBaseUrl.ts
export function getBaseUrl() {
  // 1) 显式指定（最稳）
  const publicBase = process.env.NEXT_PUBLIC_BASE_URL;
  if (publicBase) return stripTrailingSlash(publicBase);

  // 2) 生产环境强制覆盖正式域名，防止 Vercel 自动注入的二级域名暴露
  if (process.env.NODE_ENV === "production") {
    return "https://www.aqaralife-service.kr";
  }

  // 3) Vercel 自动注入（无协议）
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${stripTrailingSlash(vercelUrl)}`;

  // 4) 本地兜底
  return "http://localhost:3000";
}

function stripTrailingSlash(s: string) {
  return s.replace(/\/+$/, "");
}