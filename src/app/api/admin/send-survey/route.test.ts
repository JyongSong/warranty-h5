import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/adminAuth";
import { sendSms } from "@/lib/sms";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

vi.mock("@/lib/adminAuth", () => ({
  requireAdminApi: vi.fn(),
}));

vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    warrantyRegistration: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const requireAdminApiMock = vi.mocked(requireAdminApi);
const findUniqueMock = vi.mocked(prisma.warrantyRegistration.findUnique);
const updateMock = vi.mocked(prisma.warrantyRegistration.update);
const sendSmsMock = vi.mocked(sendSms);

describe("POST /api/admin/send-survey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects level-zero access before reading or changing registrations", async () => {
    requireAdminApiMock.mockResolvedValue({
      admin: null,
      errorResponse: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }),
    });

    const response = await POST(
      new Request("http://localhost/api/admin/send-survey", {
        method: "POST",
        body: JSON.stringify({ registrationId: "registration-1" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(requireAdminApiMock).toHaveBeenCalledWith(1);
    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it("preserves the legitimate level-one single-recipient flow", async () => {
    requireAdminApiMock.mockResolvedValue({
      admin: { id: "admin-1", name: "admin", level: 1 },
      errorResponse: null,
    });
    findUniqueMock.mockResolvedValue({
      id: "registration-1",
      installType: "installer",
      status: "confirmed",
      userPhone: "01011112222",
      confirmedAt: new Date("2026-07-01T00:00:00.000Z"),
    } as never);
    sendSmsMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue({ id: "registration-1" } as never);

    const response = await POST(
      new Request("http://localhost/api/admin/send-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: "registration-1" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, sentCount: 1 });
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: "registration-1" },
      data: { surveySentAt: expect.any(Date) },
    });
  });
});
