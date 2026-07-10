import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchedInstallationOrder } from "@/lib/installation/orders/source/fetch/model";
import { saveFetchedInstallationOrderSources } from "@/lib/installation/orders/source/persistence";
import { decryptPii, hmacPii, normalizeNameForHash, normalizePhone11 } from "@/lib/piiCrypto";

const {
  installationOrderSourceCreateMany,
  installationOrderSourceFindMany,
  installationOrderCreateMany,
} = vi.hoisted(() => ({
  installationOrderSourceCreateMany: vi.fn(),
  installationOrderSourceFindMany: vi.fn(),
  installationOrderCreateMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installationOrderSource: {
      createMany: installationOrderSourceCreateMany,
      findMany: installationOrderSourceFindMany,
    },
    installationOrder: {
      createMany: installationOrderCreateMany,
    },
  },
}));

const orders: FetchedInstallationOrder[] = [
  {
    source_key: "GIR-1",
    customer_name: "홍길동",
    phone: "010-1234-5678",
    address: "서울 강남구 테헤란로 1",
    order_numbers: "EXT-1",
    no_girl: "GIR-1",
    due_date: "20260611",
    memo: "설치비 (K100) x1",
  },
];

describe("saveFetchedInstallationOrderSources", () => {
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";
    installationOrderSourceCreateMany.mockReset();
    installationOrderSourceFindMany.mockReset();
    installationOrderCreateMany.mockReset();
    installationOrderSourceFindMany.mockResolvedValue([{ id: "source-1", sourceKey: "GIR-1" }]);
    installationOrderCreateMany.mockResolvedValue({ count: 1 });
  });

  it("stores dispatch query result columns as raw installation order sources and skips duplicate source keys", async () => {
    installationOrderSourceCreateMany.mockResolvedValue({ count: 1 });

    const result = await saveFetchedInstallationOrderSources(orders);

    expect(result).toEqual({ count: 1 });
    const call = installationOrderSourceCreateMany.mock.calls[0]?.[0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data[0]).toMatchObject({
      sourceKey: "GIR-1",
      orderNumbers: "EXT-1",
      noGirl: "GIR-1",
      dueDate: "20260611",
      memo: "설치비 (K100) x1",
    });
    expect(call.data[0].customerNameEncrypted).toMatch(/^enc:v1:/);
    expect(call.data[0].phoneEncrypted).toMatch(/^enc:v1:/);
    expect(call.data[0].addressEncrypted).toMatch(/^enc:v1:/);
    expect(decryptPii(call.data[0].customerNameEncrypted)).toBe("홍길동");
    expect(decryptPii(call.data[0].phoneEncrypted)).toBe("010-1234-5678");
    expect(decryptPii(call.data[0].addressEncrypted)).toBe("서울 강남구 테헤란로 1");
    expect(call.data[0].customerNameHash).toBe(hmacPii(normalizeNameForHash("홍길동")));
    expect(call.data[0].phoneHash).toBe(hmacPii(normalizePhone11("010-1234-5678")));
    expect(installationOrderSourceFindMany).toHaveBeenCalledWith({
      where: { sourceKey: { in: ["GIR-1"] } },
      select: { id: true, sourceKey: true },
    });
    expect(installationOrderCreateMany).toHaveBeenCalledWith({
      data: [{ sourceId: "source-1" }],
      skipDuplicates: true,
    });
  });

  it("does not derive workflow fields while storing ERP source rows", async () => {
    installationOrderSourceCreateMany.mockResolvedValue({ count: 1 });

    await saveFetchedInstallationOrderSources([
      {
        ...orders[0],
        address: "서울시 강남구 테헤란로 123 101동 202호",
      },
    ]);

    const call = installationOrderSourceCreateMany.mock.calls[0]?.[0];
    expect(decryptPii(call.data[0].addressEncrypted)).toBe("서울시 강남구 테헤란로 123 101동 202호");
    expect(call.data[0].validationErrorCode).toBeUndefined();
    expect(call.data[0].fetchedAt).toBeUndefined();
    expect(call.data[0].addressMainEncrypted).toBeUndefined();
    expect(call.data[0].addressDetailEncrypted).toBeUndefined();
    expect(call.data[0].address1Encrypted).toBeUndefined();
    expect(call.data[0].address2Encrypted).toBeUndefined();
    expect(call.data[0].requiredCapabilities).toBeUndefined();
    expect(call.data[0].requiredAqaraAppCapability).toBeUndefined();
  });

  it("stores unusable ERP phone values as raw source values without source validation fields", async () => {
    installationOrderSourceCreateMany.mockResolvedValue({ count: 1 });

    const result = await saveFetchedInstallationOrderSources([
      {
        ...orders[0],
        phone: "032-123-4567",
      },
    ]);

    expect(result).toEqual({ count: 1 });
    const call = installationOrderSourceCreateMany.mock.calls[0]?.[0];
    expect(call.data[0]).toMatchObject({
      phoneHash: null,
      memo: "설치비 (K100) x1",
    });
    expect(call.data[0].validationErrorCode).toBeUndefined();
    expect(call.data[0].phoneEncrypted).toMatch(/^enc:v1:/);
    expect(decryptPii(call.data[0].phoneEncrypted)).toBe("032-123-4567");
  });

  it("rejects fetched orders without a source key", async () => {
    await expect(
      saveFetchedInstallationOrderSources([{ ...orders[0], source_key: "" }]),
    ).rejects.toThrow("source_key is required");
    expect(installationOrderSourceCreateMany).not.toHaveBeenCalled();
    expect(installationOrderCreateMany).not.toHaveBeenCalled();
  });
});
