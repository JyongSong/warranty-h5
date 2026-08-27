import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  countInstallationOrderStatuses,
  listInstallationOrderStatuses,
} from "@/lib/installation/orders/views/orders";
import { encryptPii, hmacPii, normalizeNameForHash, normalizePhone11 } from "@/lib/piiCrypto";

const { count, findMany, installerFindMany } = vi.hoisted(() => ({
  count: vi.fn(),
  findMany: vi.fn(),
  installerFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installationOrder: {
      count,
      findMany,
    },
    installer: {
      findMany: installerFindMany,
    },
  },
}));

describe("listInstallationOrderStatuses", () => {
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";
    count.mockReset();
    findMany.mockReset();
    installerFindMany.mockReset();
  });

  it("loads installation orders with active workflow context", async () => {
    findMany.mockResolvedValue([
      {
        id: "order-1",
        status: "WAITING_INSTALLER_RESPONSE",
        activeCustomerRequestId: "request-active",
        activeAssignmentId: "assignment-active",
        source: {
          sourceKey: "SO20260611001",
          customerNameEncrypted: encryptPii("홍길동"),
          phoneEncrypted: encryptPii("010-1234-5678"),
          addressEncrypted: encryptPii("서울 강남구 테헤란로 1"),
        },
        activeCustomerRequest: {
          id: "request-active",
          installAddressEncrypted: encryptPii("서울 강남구 봉은사로 10"),
          customerPhoneEncrypted: encryptPii("010-9999-0000"),
        },
        activeAssignment: {
          id: "assignment-active",
          installerId: "installer-active",
          installer: {
            name: "김기사",
            phone: "01012345678",
            branch: "서울강남지점",
          },
        },
        customerRequests: [
          {
            id: "request-newer",
            installAddressEncrypted: encryptPii("서울 강남구 최신로 99"),
            customerPhoneEncrypted: encryptPii("010-1111-1111"),
          },
          {
            id: "request-active",
            installAddressEncrypted: encryptPii("서울 강남구 봉은사로 10"),
            customerPhoneEncrypted: encryptPii("010-9999-0000"),
          },
        ],
        assignmentAttempts: [
          {
            id: "assignment-newer",
            installerId: "installer-newer",
            installer: {
              name: "최신기사",
              phone: "01011111111",
              branch: "서울최신지점",
            },
          },
          {
            id: "assignment-active",
            installerId: "installer-active",
            installer: {
              name: "김기사",
              phone: "01012345678",
              branch: "서울강남지점",
            },
          },
        ],
      },
    ]);

    const result = await listInstallationOrderStatuses({ limit: 100 });

    expect(result[0]).toMatchObject({
      id: "order-1",
      status: "WAITING_INSTALLER_RESPONSE",
      sourceCustomerName: "홍길동",
      sourcePhone: "010-1234-5678",
      sourceAddress: "서울 강남구 테헤란로 1",
      customerRequests: [
        {
          id: "request-active",
          installAddress: "서울 강남구 봉은사로 10",
          customerPhone: "010-9999-0000",
        },
      ],
      assignmentAttempts: [
        {
          id: "assignment-active",
          installerId: "installer-active",
          installer: {
            name: "김기사",
            phone: "01012345678",
            branch: "서울강남지점",
          },
        },
      ],
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: { notIn: ["CANCELLED", "COMPLETED"] },
      },
      orderBy: { statusChangedAt: "desc" },
      take: 100,
      select: expect.objectContaining({
        id: true,
        status: true,
        activeCustomerRequestId: true,
        activeAssignmentId: true,
        activeCustomerRequest: expect.any(Object),
        activeAssignment: expect.any(Object),
        customerRequests: expect.objectContaining({
          orderBy: { updatedAt: "desc" },
        }),
        assignmentAttempts: expect.objectContaining({
          orderBy: { createdAt: "desc" },
        }),
      }),
    });
    expect(installerFindMany).not.toHaveBeenCalled();
  });

  it("redacts PII fields instead of failing the list when decryption is unavailable", async () => {
    const sourceCustomerNameEncrypted = encryptPii("홍길동");
    const sourcePhoneEncrypted = encryptPii("010-1234-5678");
    const sourceAddressEncrypted = encryptPii("서울 강남구 테헤란로 1");
    const installAddressEncrypted = encryptPii("서울 강남구 봉은사로 10");
    const customerPhoneEncrypted = encryptPii("010-9999-0000");
    process.env.PII_ENCRYPTION_KEY = "";
    findMany.mockResolvedValue([
      {
        id: "order-1",
        status: "WAITING_INSTALLER_RESPONSE",
        source: {
          sourceKey: "SO20260611001",
          customerNameEncrypted: sourceCustomerNameEncrypted,
          phoneEncrypted: sourcePhoneEncrypted,
          addressEncrypted: sourceAddressEncrypted,
        },
        customerRequests: [
          {
            id: "request-1",
            installAddressEncrypted,
            customerPhoneEncrypted,
          },
        ],
        assignmentAttempts: [],
        issues: [],
      },
    ]);

    const result = await listInstallationOrderStatuses({ limit: 100 });

    expect(result[0]).toMatchObject({
      id: "order-1",
      sourceCustomerName: null,
      sourcePhone: null,
      sourceAddress: null,
      customerRequests: [
        {
          id: "request-1",
          installAddress: null,
          customerPhone: null,
        },
      ],
    });
  });

  it("filters installation orders by exact hashed customer name or phone", async () => {
    findMany.mockResolvedValue([
      {
        id: "order-1",
        status: "WAITING_CUSTOMER_INPUT",
        source: {
          sourceKey: "SO20260611001",
          customerNameEncrypted: encryptPii("홍길동"),
          phoneEncrypted: encryptPii("01012345678"),
          addressEncrypted: encryptPii("서울 강남구 테헤란로 1"),
        },
        customerRequests: [],
        assignmentAttempts: [],
        issues: [],
      },
    ]);

    const result = await listInstallationOrderStatuses({ query: "010-1234-5678", limit: 100 });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "order-1",
      sourceCustomerName: "홍길동",
      sourcePhone: "01012345678",
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: { notIn: ["CANCELLED", "COMPLETED"] },
        OR: [
          { source: { is: { phoneHash: hmacPii(normalizePhone11("010-1234-5678")) } } },
          { customerRequests: { some: { customerPhoneHash: hmacPii(normalizePhone11("010-1234-5678")) } } },
          { customerRequests: { some: { ordererPhoneHash: hmacPii(normalizePhone11("010-1234-5678")) } } },
          { source: { is: { sourceKey: { contains: "010-1234-5678", mode: "insensitive" } } } },
          { source: { is: { orderNumbers: { contains: "010-1234-5678", mode: "insensitive" } } } },
          { source: { is: { noGirl: { contains: "010-1234-5678", mode: "insensitive" } } } },
        ],
      },
      orderBy: { statusChangedAt: "desc" },
      take: 100,
      select: expect.objectContaining({
        id: true,
        status: true,
      }),
    });

    await listInstallationOrderStatuses({ query: "홍 길동", limit: 100 });

    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          status: { notIn: ["CANCELLED", "COMPLETED"] },
          OR: [
            { source: { is: { customerNameHash: hmacPii(normalizeNameForHash("홍 길동")) } } },
            { source: { is: { sourceKey: { contains: "홍 길동", mode: "insensitive" } } } },
            { source: { is: { orderNumbers: { contains: "홍 길동", mode: "insensitive" } } } },
            { source: { is: { noGirl: { contains: "홍 길동", mode: "insensitive" } } } },
          ],
        },
      }),
    );
  });

  it("filters installation orders by source order identifiers", async () => {
    findMany.mockResolvedValue([]);

    await listInstallationOrderStatuses({ query: "ONS20260604942", limit: 100 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { notIn: ["CANCELLED", "COMPLETED"] },
          OR: [
            { source: { is: { customerNameHash: hmacPii(normalizeNameForHash("ONS20260604942")) } } },
            { source: { is: { sourceKey: { contains: "ONS20260604942", mode: "insensitive" } } } },
            { source: { is: { orderNumbers: { contains: "ONS20260604942", mode: "insensitive" } } } },
            { source: { is: { noGirl: { contains: "ONS20260604942", mode: "insensitive" } } } },
          ],
        },
      }),
    );
  });

  it("filters installation orders by the selected date range search field", async () => {
    findMany.mockResolvedValue([]);

    await listInstallationOrderStatuses({
      searchCondition: {
        field: "desiredInstallDate",
        from: "2026-06-01",
        to: "2026-06-30",
      },
      limit: 100,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              customerRequests: { some: { installDate: { gte: "2026-06-01", lte: "2026-06-30" } } },
            },
          ],
        }),
      }),
    );
  });

  it("filters source due dates using compact ERP date values while preserving customer install date format", async () => {
    findMany.mockResolvedValue([]);

    await listInstallationOrderStatuses({
      searchCondition: {
        field: "orderDate",
        from: "2026-06-01",
        to: "2026-06-30",
      },
      limit: 100,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              source: { is: { dueDate: { gte: "20260601", lte: "20260630" } } },
            },
          ],
        }),
      }),
    );
  });

  it("filters installation orders by the selected installer search field", async () => {
    findMany.mockResolvedValue([]);
    installerFindMany.mockResolvedValue([{ id: "installer-1" }, { id: "installer-2" }]);

    await listInstallationOrderStatuses({
      searchCondition: {
        field: "installerPhone",
        keyword: "010-9999-0000",
      },
      limit: 100,
    });

    expect(installerFindMany).toHaveBeenCalledWith({
      where: {
        phone: { contains: "01099990000", mode: "insensitive" },
      },
      select: { id: true },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                { currentInstallerId: { in: ["installer-1", "installer-2"] } },
                { assignmentAttempts: { some: { installerId: { in: ["installer-1", "installer-2"] } } } },
              ],
            },
          ],
        }),
      }),
    );
  });

  it("treats invalid selected customer phone searches as no matches instead of throwing", async () => {
    findMany.mockResolvedValue([]);

    await listInstallationOrderStatuses({
      searchCondition: {
        field: "customerPhone",
        keyword: "123",
      },
      limit: 100,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [{ id: "__NO_MATCHING_PHONE__" }],
        }),
      }),
    );
  });

  it("normalizes selected installer phone searches to match imported digit-only phones", async () => {
    findMany.mockResolvedValue([]);
    installerFindMany.mockResolvedValue([{ id: "installer-1" }]);

    await listInstallationOrderStatuses({
      searchCondition: {
        field: "installerPhone",
        keyword: "010-9999-0000",
      },
      limit: 100,
    });

    expect(installerFindMany).toHaveBeenCalledWith({
      where: {
        phone: { contains: "01099990000", mode: "insensitive" },
      },
      select: { id: true },
    });
  });

  it("uses offset for database pagination", async () => {
    findMany.mockResolvedValue([]);

    await listInstallationOrderStatuses({ limit: 50, offset: 100 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 100,
        take: 50,
      }),
    );
  });

  it("loads assigned installation orders when requested", async () => {
    findMany.mockResolvedValue([]);

    await listInstallationOrderStatuses({ statusView: "assigned", limit: 100 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "INSTALLER_ASSIGNED",
        },
      }),
    );
  });

  it("loads customer input SMS required installation orders when requested", async () => {
    findMany.mockResolvedValue([]);

    await listInstallationOrderStatuses({ statusView: "customerInputSmsRequired", limit: 100 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "CUSTOMER_INPUT_SMS_REQUIRED",
        },
      }),
    );
  });

  it("filters terminal installation orders by status change date range", async () => {
    findMany.mockResolvedValue([]);

    const statusChangedFrom = new Date("2026-05-24T00:00:00.000+09:00");
    const statusChangedTo = new Date("2026-06-23T00:00:00.000+09:00");

    await listInstallationOrderStatuses({
      statusView: "completed",
      statusChangedFrom,
      statusChangedTo,
      limit: 100,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "COMPLETED",
          statusChangedAt: {
            gte: statusChangedFrom,
            lt: statusChangedTo,
          },
        },
      }),
    );
  });

  it("loads action-oriented installation order filters when requested", async () => {
    findMany.mockResolvedValue([]);

    await listInstallationOrderStatuses({ statusView: "attention", limit: 100 });
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { hasOpenIssue: true },
            { status: "CUSTOMER_INPUT_SMS_REQUIRED" },
            { status: "WAITING_ADMIN_REVIEW" },
          ],
        },
      }),
    );

    await listInstallationOrderStatuses({ statusView: "attentionCustomerInputSmsRequired", limit: 100 });
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          status: "CUSTOMER_INPUT_SMS_REQUIRED",
        },
      }),
    );

    await listInstallationOrderStatuses({ statusView: "attentionAdminReview", limit: 100 });
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          status: "WAITING_ADMIN_REVIEW",
        },
      }),
    );

    await listInstallationOrderStatuses({ statusView: "attentionIssueOnly", limit: 100 });
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          hasOpenIssue: true,
          status: { notIn: ["CUSTOMER_INPUT_SMS_REQUIRED", "WAITING_ADMIN_REVIEW"] },
        },
      }),
    );

    await listInstallationOrderStatuses({ statusView: "waitingAdminReview", limit: 100 });
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          status: "WAITING_ADMIN_REVIEW",
        },
      }),
    );
  });

  it("loads all installation orders when requested", async () => {
    findMany.mockResolvedValue([]);

    await listInstallationOrderStatuses({ statusView: "all", limit: 100 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      }),
    );
  });

  it("counts the matching database rows", async () => {
    count.mockResolvedValue(123);

    await expect(countInstallationOrderStatuses({ query: "010-1234-5678" })).resolves.toBe(123);
    expect(count).toHaveBeenCalledWith({
      where: {
        status: { notIn: ["CANCELLED", "COMPLETED"] },
        OR: [
          { source: { is: { phoneHash: hmacPii(normalizePhone11("010-1234-5678")) } } },
          { customerRequests: { some: { customerPhoneHash: hmacPii(normalizePhone11("010-1234-5678")) } } },
          { customerRequests: { some: { ordererPhoneHash: hmacPii(normalizePhone11("010-1234-5678")) } } },
          { source: { is: { sourceKey: { contains: "010-1234-5678", mode: "insensitive" } } } },
          { source: { is: { orderNumbers: { contains: "010-1234-5678", mode: "insensitive" } } } },
          { source: { is: { noGirl: { contains: "010-1234-5678", mode: "insensitive" } } } },
        ],
      },
    });
  });

  it("counts assigned installation orders when requested", async () => {
    count.mockResolvedValue(2);

    await expect(countInstallationOrderStatuses({ statusView: "assigned" })).resolves.toBe(2);
    expect(count).toHaveBeenCalledWith({
      where: {
        status: "INSTALLER_ASSIGNED",
      },
    });
  });

  it("counts customer input SMS required installation orders when requested", async () => {
    count.mockResolvedValue(2);

    await expect(countInstallationOrderStatuses({ statusView: "customerInputSmsRequired" })).resolves.toBe(2);
    expect(count).toHaveBeenCalledWith({
      where: {
        status: "CUSTOMER_INPUT_SMS_REQUIRED",
      },
    });
  });

  it("counts action-required customer input SMS orders in the attention filter", async () => {
    count.mockResolvedValue(3);

    await expect(countInstallationOrderStatuses({ statusView: "attention" })).resolves.toBe(3);
    expect(count).toHaveBeenCalledWith({
      where: {
        OR: [
          { hasOpenIssue: true },
          { status: "CUSTOMER_INPUT_SMS_REQUIRED" },
          { status: "WAITING_ADMIN_REVIEW" },
        ],
      },
    });
  });

  it("counts exclusive attention sub-filters", async () => {
    count.mockResolvedValue(3);

    await expect(
      countInstallationOrderStatuses({ statusView: "attentionCustomerInputSmsRequired" }),
    ).resolves.toBe(3);
    expect(count).toHaveBeenLastCalledWith({
      where: {
        status: "CUSTOMER_INPUT_SMS_REQUIRED",
      },
    });

    await expect(countInstallationOrderStatuses({ statusView: "attentionAdminReview" })).resolves.toBe(3);
    expect(count).toHaveBeenLastCalledWith({
      where: {
        status: "WAITING_ADMIN_REVIEW",
      },
    });

    await expect(countInstallationOrderStatuses({ statusView: "attentionIssueOnly" })).resolves.toBe(3);
    expect(count).toHaveBeenLastCalledWith({
      where: {
        hasOpenIssue: true,
        status: { notIn: ["CUSTOMER_INPUT_SMS_REQUIRED", "WAITING_ADMIN_REVIEW"] },
      },
    });
  });

  it("counts terminal installation orders within the status change date range", async () => {
    count.mockResolvedValue(2);

    const statusChangedFrom = new Date("2026-05-24T00:00:00.000+09:00");
    const statusChangedTo = new Date("2026-06-23T00:00:00.000+09:00");

    await expect(
      countInstallationOrderStatuses({
        statusView: "cancelled",
        statusChangedFrom,
        statusChangedTo,
      }),
    ).resolves.toBe(2);
    expect(count).toHaveBeenCalledWith({
      where: {
        status: "CANCELLED",
        statusChangedAt: {
          gte: statusChangedFrom,
          lt: statusChangedTo,
        },
      },
    });
  });
});
