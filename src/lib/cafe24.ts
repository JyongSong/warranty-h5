import { prisma } from "./prisma";

const CLIENT_ID = process.env.CAFE24_CLIENT_ID || "";
const CLIENT_SECRET = process.env.CAFE24_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.CAFE24_REDIRECT_URI || "";
const MALL_ID = process.env.CAFE24_MALL_ID || "aqarakr";

interface Cafe24TokenResponse {
  access_token: string;
  expires_at: string;
  refresh_token: string;
  refresh_token_expires_at: string;
  client_id: string;
  mall_id: string;
  user_id: string;
  scopes: string[];
}

/**
 * 获取有效的 Cafe24 Access Token
 * 如果已过期或即将过期（5分钟内），则自动调用 refresh_token 进行刷新并存入数据库
 */
export async function getValidAccessToken(mallId: string = MALL_ID): Promise<string> {
  const token = await prisma.cafe24_tokens.findUnique({
    where: { mall_id: mallId },
  });

  if (!token) {
    throw new Error(`MALL_TOKEN_NOT_FOUND: No token found for mall ${mallId}. Please perform admin OAuth first.`);
  }

  const now = new Date();
  const bufferTime = 5 * 60 * 1000; // 5分钟缓冲时间
  const isExpired = new Date(token.expires_at).getTime() - now.getTime() < bufferTime;

  if (!isExpired) {
    return token.access_token;
  }

  console.log(`[Cafe24 Auth] Access token for ${mallId} is expired/expiring. Refreshing...`);
  return await refreshAccessToken(mallId, token.refresh_token);
}

/**
 * 使用 refresh_token 刷新 Access Token
 */
async function refreshAccessToken(mallId: string, refreshToken: string): Promise<string> {
  const url = `https://${mallId}.cafe24api.com/api/v2/oauth/token`;
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`[Cafe24 Auth] Token refresh failed for ${mallId}:`, data);
    throw new Error(`TOKEN_REFRESH_FAILED: ${data.error_description || "Unknown error"}`);
  }

  const tokenData = data as Cafe24TokenResponse;

  // 更新数据库
  await prisma.cafe24_tokens.update({
    where: { mall_id: mallId },
    data: {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: new Date(tokenData.expires_at),
      refresh_token_expires_at: new Date(tokenData.refresh_token_expires_at),
      updated_at: new Date(),
    },
  });

  console.log(`[Cafe24 Auth] Token refreshed successfully for ${mallId}`);
  return tokenData.access_token;
}

/**
 * 交换 Authorization Code 获取初始 Tokens
 */
export async function getInitialTokens(mallId: string, code: string): Promise<void> {
  const url = `https://${mallId}.cafe24api.com/api/v2/oauth/token`;
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`[Cafe24 Auth] Initial token exchange failed for ${mallId}:`, data);
    throw new Error(`TOKEN_EXCHANGE_FAILED: ${data.error_description || "Unknown error"}`);
  }

  const tokenData = data as Cafe24TokenResponse;

  // 保存或更新至数据库
  await prisma.cafe24_tokens.upsert({
    where: { mall_id: mallId },
    update: {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: new Date(tokenData.expires_at),
      refresh_token_expires_at: new Date(tokenData.refresh_token_expires_at),
      scope: tokenData.scopes ? tokenData.scopes.join(",") : null,
      client_id: tokenData.client_id,
      updated_at: new Date(),
    },
    create: {
      mall_id: mallId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: new Date(tokenData.expires_at),
      refresh_token_expires_at: new Date(tokenData.refresh_token_expires_at),
      scope: tokenData.scopes ? tokenData.scopes.join(",") : null,
      client_id: tokenData.client_id,
    },
  });

  console.log(`[Cafe24 Auth] Initial tokens saved for mall ${mallId}`);
}

/**
 * 获取订单的详细信息（包含订单项目 items 嵌入）
 */
export async function fetchOrderDetails(mallId: string, orderId: string) {
  const accessToken = await getValidAccessToken(mallId);
  const url = `https://${mallId}.cafe24api.com/api/v2/admin/orders/${orderId}?embed=items`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Cafe24-Api-Version": "2024-06", // 声明 API 版本
    },
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`[Cafe24 API] Fetch order ${orderId} failed:`, data);
    throw new Error(`FETCH_ORDER_FAILED: ${data.error?.message || "Unknown error"}`);
  }

  return data.order;
}
