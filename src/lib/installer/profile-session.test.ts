import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.INSTALLER_SESSION_SECRET = "test-secret-for-profile-session";
});

const NOW = Date.UTC(2026, 8, 15, 0, 0, 0);

async function load() {
  return import("./profile-session");
}

describe("프로필 전용 토큰", () => {
  it("발급한 토큰에서 기사 id 를 되읽는다", async () => {
    const { createProfileSessionToken, parseProfileSessionToken } = await load();
    const token = createProfileSessionToken("installer-1", NOW);
    expect(parseProfileSessionToken(token, NOW)).toBe("installer-1");
  });

  it("30분이 지나면 만료된다", async () => {
    const { createProfileSessionToken, parseProfileSessionToken } = await load();
    const token = createProfileSessionToken("installer-1", NOW);
    expect(parseProfileSessionToken(token, NOW + 29 * 60 * 1000)).toBe("installer-1");
    expect(parseProfileSessionToken(token, NOW + 31 * 60 * 1000)).toBeNull();
  });

  it("서명이 깨진 토큰을 거부한다", async () => {
    const { createProfileSessionToken, parseProfileSessionToken } = await load();
    const token = createProfileSessionToken("installer-1", NOW);
    const [data] = token.split(".");
    expect(parseProfileSessionToken(`${data}.forged`, NOW)).toBeNull();
    expect(parseProfileSessionToken(`${data}.`, NOW)).toBeNull();
    expect(parseProfileSessionToken("", NOW)).toBeNull();
    expect(parseProfileSessionToken(undefined, NOW)).toBeNull();
  });

  it("payload 를 바꾸면 통과하지 못한다", async () => {
    const { createProfileSessionToken, parseProfileSessionToken } = await load();
    const token = createProfileSessionToken("installer-1", NOW);
    const [, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ installerId: "installer-2", exp: Math.floor(NOW / 1000) + 600 }),
    ).toString("base64url");
    expect(parseProfileSessionToken(`${forged}.${signature}`, NOW)).toBeNull();
  });

  it("★ 앱 세션 토큰과 서로 바꿔 쓸 수 없다", async () => {
    // 이 화면의 토큰이 기사 앱 세션으로 통하면, 정보 한 번 채우자고 받은 링크로
    // 설치 목록·정산까지 들어갈 수 있게 된다. 서명에 용도를 섞어 막는다.
    //
    // session.ts 를 직접 부르면 prisma 가 딸려 와 테스트 환경에서 못 돈다.
    // 앱 세션의 서명 방식(payload 를 그대로 HMAC)을 여기서 그대로 재현해 비교한다.
    const { createProfileSessionToken, parseProfileSessionToken } = await load();
    const secret = process.env.INSTALLER_SESSION_SECRET!;

    const appPayload = Buffer.from(JSON.stringify({ installerId: "installer-1" })).toString(
      "base64url",
    );
    const appSignature = createHmac("sha256", secret).update(appPayload).digest("base64url");
    const appToken = `${appPayload}.${appSignature}`;

    // 앱 토큰을 프로필 쿠키 자리에 넣어도 통하지 않는다.
    expect(parseProfileSessionToken(appToken, NOW)).toBeNull();

    // 반대 방향도 막힌다: 프로필 토큰의 서명은 앱 방식으로 계산한 값과 다르다.
    const profileToken = createProfileSessionToken("installer-1", NOW);
    const [profileData, profileSignature] = profileToken.split(".");
    const asAppWouldSign = createHmac("sha256", secret).update(profileData).digest("base64url");
    expect(profileSignature).not.toBe(asAppWouldSign);
  });
});
