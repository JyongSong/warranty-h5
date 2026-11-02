import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geocodeAddress, getDrivingDistanceMeters } from "@/lib/installation/distance/naver";

const fetchMock = vi.fn();
const installer = { latitude: 35.1, longitude: 128.1 };
const customer = { latitude: 35.2, longitude: 128.2 };

function respondWith(body: unknown, status = 200) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("naver maps client", () => {
  beforeEach(() => {
    process.env.NAVER_MAP_CLIENT_ID = "client-id";
    process.env.NAVER_MAP_CLIENT_SECRET = "client-secret";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps geocoding x/y strings to latitude and longitude", async () => {
    respondWith({ status: "OK", addresses: [{ x: "128.6", y: "35.8" }] });

    await expect(geocodeAddress("대구 중구 대봉로 260")).resolves.toEqual({ latitude: 35.8, longitude: 128.6 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/map-geocode/v2/geocode?");
    expect(init.headers).toMatchObject({
      "x-ncp-apigw-api-key-id": "client-id",
      "x-ncp-apigw-api-key": "client-secret",
    });
  });

  it("returns null when the address has no geocoding result", async () => {
    respondWith({ status: "OK", addresses: [] });

    await expect(geocodeAddress("없는 주소")).resolves.toBeNull();
  });

  it("sends longitude first and reads the driving distance", async () => {
    respondWith({ code: 0, route: { traoptimal: [{ summary: { distance: 12345 } }] } });

    await expect(getDrivingDistanceMeters(installer, customer)).resolves.toBe(12345);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("start")).toBe("128.1,35.1");
    expect(url.searchParams.get("goal")).toBe("128.2,35.2");
  });

  it("treats the same start and goal as zero meters and no route as null", async () => {
    respondWith({ code: 1, message: "same point" });
    await expect(getDrivingDistanceMeters(installer, customer)).resolves.toBe(0);

    respondWith({ code: 3, message: "no route" });
    await expect(getDrivingDistanceMeters(installer, customer)).resolves.toBeNull();
  });

  it("throws on a provider error and when keys are missing", async () => {
    respondWith({}, 401);
    await expect(geocodeAddress("주소")).rejects.toThrow("NAVER_MAP_HTTP_401");

    delete process.env.NAVER_MAP_CLIENT_SECRET;
    await expect(geocodeAddress("주소")).rejects.toThrow("NAVER_MAP_NOT_CONFIGURED");
  });
});
