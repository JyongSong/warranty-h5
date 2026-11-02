import { beforeEach, describe, expect, it, vi } from "vitest";
import { getInstallerDistances, syncInstallerCoordinates } from "@/lib/installation/distance/service";

const { findInstallers, updateInstaller, findGeocode, upsertGeocode, findDistances, upsertDistance, geocodeAddress, getDrivingDistanceMeters } =
  vi.hoisted(() => ({
    findInstallers: vi.fn(),
    updateInstaller: vi.fn(),
    findGeocode: vi.fn(),
    upsertGeocode: vi.fn(),
    findDistances: vi.fn(),
    upsertDistance: vi.fn(),
    geocodeAddress: vi.fn(),
    getDrivingDistanceMeters: vi.fn(),
  }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installer: { findMany: findInstallers, update: updateInstaller },
    addressGeocodeCache: { findUnique: findGeocode, upsert: upsertGeocode },
    installerDrivingDistance: { findMany: findDistances, upsert: upsertDistance },
  },
}));

vi.mock("@/lib/installation/distance/naver", () => ({ geocodeAddress, getDrivingDistanceMeters }));

function installerAt(id: string, longitude: number) {
  return {
    id,
    name: id,
    branch: null,
    phone: null,
    address: `주소 ${id}`,
    latitude: 35,
    longitude,
    geocodedAddress: `주소 ${id}`,
  };
}

describe("installer distance service", () => {
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";
    vi.clearAllMocks();
    findGeocode.mockResolvedValue({ latitude: 35, longitude: 128 });
    findDistances.mockResolvedValue([]);
    getDrivingDistanceMeters.mockResolvedValue(1000);
  });

  it("looks up driving distance only for the nearest five plus the included installer", async () => {
    findInstallers.mockResolvedValue([
      ...Array.from({ length: 7 }, (_, index) => installerAt(`near-${index}`, 128 + index * 0.01)),
      installerAt("far", 129),
    ]);

    const result = await getInstallerDistances({ address: "대구 중구 대봉로 260", includeInstallerIds: ["far"] });

    expect(getDrivingDistanceMeters).toHaveBeenCalledTimes(6);
    expect(result).toMatchObject({ status: "OK", included: [{ installerId: "far", drivingMeters: 1000 }] });
    if (result.status === "OK") expect(result.eligible[6].drivingMeters).toBeNull();
  });

  it("reuses a cached distance while the installer coordinates are unchanged", async () => {
    findInstallers.mockResolvedValue([installerAt("a", 128.1), installerAt("b", 128.2)]);
    findDistances.mockResolvedValue([
      { installerId: "a", installerLatitude: 35, installerLongitude: 128.1, distanceMeters: 500 },
      { installerId: "b", installerLatitude: 35, installerLongitude: 128.15, distanceMeters: 500 },
    ]);

    const result = await getInstallerDistances({ address: "대구 중구 대봉로 260" });

    expect(getDrivingDistanceMeters).toHaveBeenCalledTimes(1);
    expect(upsertDistance).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      eligible: [
        { installerId: "a", drivingMeters: 500 },
        { installerId: "b", drivingMeters: 1000 },
      ],
    });
  });

  it("skips installers whose address changed after geocoding and those outside the eligible list", async () => {
    findInstallers.mockResolvedValue([
      { ...installerAt("moved", 128.1), address: "새 주소" },
      installerAt("other", 128.2),
      installerAt("eligible", 128.3),
    ]);

    const result = await getInstallerDistances({
      address: "대구 중구 대봉로 260",
      eligibleInstallerIds: ["moved", "eligible"],
    });

    expect(result).toMatchObject({ eligible: [{ installerId: "eligible" }] });
  });

  it("reports an address cached as not found without calling Naver", async () => {
    findGeocode.mockResolvedValue({ latitude: null, longitude: null });

    await expect(getInstallerDistances({ address: "없는 주소" })).resolves.toEqual({ status: "ADDRESS_NOT_FOUND" });
    expect(geocodeAddress).not.toHaveBeenCalled();
  });

  it("geocodes only changed addresses and remembers a failed address", async () => {
    const now = new Date("2026-11-02T00:00:00.000Z");
    findInstallers.mockResolvedValue([
      { id: "done", address: "주소 1", geocodedAddress: "주소 1" },
      { id: "new", address: " 주소 2 ", geocodedAddress: null },
      { id: "missing", address: "주소 3", geocodedAddress: "옛 주소" },
    ]);
    geocodeAddress.mockResolvedValueOnce({ latitude: 35, longitude: 128 }).mockResolvedValueOnce(null);

    await expect(syncInstallerCoordinates({ now })).resolves.toEqual({ processedCount: 2, remainingCount: 0 });

    expect(updateInstaller).toHaveBeenCalledWith({
      where: { id: "new" },
      data: { latitude: 35, longitude: 128, geocodedAddress: "주소 2", geocodedAt: now },
    });
    expect(updateInstaller).toHaveBeenCalledWith({
      where: { id: "missing" },
      data: { latitude: null, longitude: null, geocodedAddress: "주소 3", geocodedAt: now },
    });
  });
});
