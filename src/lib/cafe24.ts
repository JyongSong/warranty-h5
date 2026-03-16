import crypto from "crypto";
import { prisma } from "@/lib/prisma";

type Cafe24TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  refresh_token_expires_at: string;
  client_id?: string;
  mall_id?: string;
  shop_no?: number;
  scopes?: string[];
  scope?: string;
};

type Cafe24StatePayload = {
  nonce: string;
  returnTo: string;
  issuedAt: number;
};

function getRequiredEnv(
  name:
    | "CAFE24_MALL_ID"
    | "CAFE24_CLIENT_ID"
    | "CAFE24_CLIENT_SECRET"
    | "CAFE24_REDIRECT_URI"
    | "CAFE24_SMS_SENDER_NO"
    | "INTERNAL_API_KEY"
) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name}_MISSING`);
  }

  return value;
}

export function getCafe24MallId() {
  return getRequiredEnv("CAFE24_MALL_ID");
}

function getCafe24StateSecret() {
  const secret = process.env.CAFE24_STATE_SECRET?.trim();

  if (!secret) {
    throw new Error("CAFE24_STATE_SECRET_MISSING");
  }

  return secret;
}

function toBase64Url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function fromBase64Url(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signState(data: string) {
  return crypto.createHmac("sha256", getCafe24StateSecret()).update(data).digest("base64url");
}

export function createCafe24State(returnTo = "/cafe24") {
  const payload: Cafe24StatePayload = {
    nonce: crypto.randomBytes(16).toString("hex"),
    returnTo,
    issuedAt: Date.now(),
  };

  const data = toBase64Url(JSON.stringify(payload));
  const signature = signState(data);
  return `${data}.${signature}`;
}

export function verifyCafe24State(state: string | null | undefined) {
  if (!state) {
    throw new Error("CAFE24_STATE_MISSING");
  }

  const [data, signature] = state.split(".");
  if (!data || !signature) {
    throw new Error("CAFE24_STATE_INVALID");
  }

  const expected = signState(data);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);

  if (left.length !== right.length || !Buffer.from(left).equals(right)) {
    throw new Error("CAFE24_STATE_INVALID");
  }

  const payload = JSON.parse(fromBase64Url(data)) as Cafe24StatePayload;

  if (!payload.returnTo || !payload.issuedAt) {
    throw new Error("CAFE24_STATE_INVALID");
  }

  if (Date.now() - payload.issuedAt > 10 * 60 * 1000) {
    throw new Error("CAFE24_STATE_EXPIRED");
  }

  return payload;
}

export function getCafe24AuthorizeUrl(state?: string) {
  const clientId = getRequiredEnv("CAFE24_CLIENT_ID");
  const redirectUri = getRequiredEnv("CAFE24_REDIRECT_URI");
  const mallId = getCafe24MallId();
  const scope = (process.env.CAFE24_SCOPE || "mall.read_application").trim();

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state: state || createCafe24State("/cafe24"),
  });

  return `https://${mallId}.cafe24api.com/api/v2/oauth/authorize?${params.toString()}`;
}

async function requestCafe24Token(params: URLSearchParams) {
  const clientId = getRequiredEnv("CAFE24_CLIENT_ID");
  const clientSecret = getRequiredEnv("CAFE24_CLIENT_SECRET");
  const mallId = getCafe24MallId();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const r = await fetch(`https://${mallId}.cafe24api.com/api/v2/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    cache: "no-store",
  });

  const data = (await r.json().catch(() => ({}))) as Partial<Cafe24TokenResponse> & {
    error?: string;
    error_description?: string;
  };

  if (!r.ok) {
    throw new Error(data.error_description || data.error || "CAFE24_TOKEN_REQUEST_FAILED");
  }

  return data as Cafe24TokenResponse;
}

async function upsertCafe24Token(data: Cafe24TokenResponse) {
  const mallId = data.mall_id || getCafe24MallId();

  return prisma.cafe24Token.upsert({
    where: { mallId },
    update: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(data.expires_at),
      refreshTokenExpiresAt: new Date(data.refresh_token_expires_at),
      clientId: data.client_id || null,
      scope: Array.isArray(data.scopes) ? data.scopes.join(" ") : data.scope || null,
    },
    create: {
      mallId,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(data.expires_at),
      refreshTokenExpiresAt: new Date(data.refresh_token_expires_at),
      clientId: data.client_id || null,
      scope: Array.isArray(data.scopes) ? data.scopes.join(" ") : data.scope || null,
    },
  });
}

export async function exchangeCafe24Code(code: string) {
  const redirectUri = getRequiredEnv("CAFE24_REDIRECT_URI");

  const data = await requestCafe24Token(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    })
  );

  return upsertCafe24Token(data);
}

export async function refreshCafe24Token(refreshToken: string) {
  const data = await requestCafe24Token(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })
  );

  return upsertCafe24Token(data);
}

export async function getActiveCafe24Token() {
  const mallId = getCafe24MallId();
  const token = await prisma.cafe24Token.findUnique({ where: { mallId } });

  if (!token) {
    throw new Error("CAFE24_TOKEN_NOT_CONNECTED");
  }

  const refreshThreshold = Date.now() + 2 * 60 * 1000;

  if (token.expiresAt.getTime() <= refreshThreshold) {
    const refreshed = await refreshCafe24Token(token.refreshToken);
    return refreshed.accessToken;
  }

  return token.accessToken;
}

export async function sendCafe24Sms(toDigits: string, content: string) {
  const mallId = getCafe24MallId();
  const senderNo = getRequiredEnv("CAFE24_SMS_SENDER_NO");
  const accessToken = await getActiveCafe24Token();

  const r = await fetch(`https://${mallId}.cafe24api.com/api/v2/admin/sms`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender_no: senderNo,
      content,
      recipients: [toDigits],
    }),
    cache: "no-store",
  });

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(
      typeof data === "object" && data && "message" in data
        ? String(data.message)
        : "CAFE24_SMS_SEND_FAILED"
    );
  }

  return data;
}

export async function getCafe24Status() {
  const mallId = process.env.CAFE24_MALL_ID?.trim() || null;

  if (!mallId) {
    return {
      configured: false,
      connected: false,
      token: null,
    };
  }

  const token = await prisma.cafe24Token.findUnique({
    where: { mallId },
    select: {
      mallId: true,
      expiresAt: true,
      refreshTokenExpiresAt: true,
      scope: true,
      updatedAt: true,
    },
  });

  return {
    configured: true,
    connected: Boolean(token),
    token,
  };
}

export function validateInternalApiKey(value: string | null) {
  return value === getRequiredEnv("INTERNAL_API_KEY");
}
