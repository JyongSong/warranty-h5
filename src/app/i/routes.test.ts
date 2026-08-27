import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import CustomerTokenPage from "./c/[token]/page";
import InstallerTokenPage from "./i/[token]/page";
import { getInstallationCustomerRequestByToken } from "@/lib/installation/customer/request";
import { getInstallerAssignmentByToken } from "@/lib/installation/installer/response";

vi.mock("@/lib/installation/customer/request", () => ({
  getInstallationCustomerRequestByToken: vi.fn(),
}));

vi.mock("@/lib/installation/installer/response", () => ({
  getInstallerAssignmentByToken: vi.fn(),
}));

const appDir = join(process.cwd(), "src", "app");

describe("public installation routes", () => {
  it("only exposes /i/c and /i/i as public installation token routes", () => {
    expect(existsSync(join(appDir, "i", "c", "[token]", "page.tsx"))).toBe(true);
    expect(existsSync(join(appDir, "i", "i", "[token]", "page.tsx"))).toBe(true);
    expect(existsSync(join(appDir, "ri"))).toBe(false);
    expect(existsSync(join(appDir, "cia"))).toBe(false);
    expect(existsSync(join(appDir, "installation"))).toBe(false);
  });

  it("renders customer input by /i/c/{token} path param", async () => {
    vi.mocked(getInstallationCustomerRequestByToken).mockResolvedValue({
      status: "VALID",
      request: {
        id: "customer-request-1",
        installationOrderId: "order-1",
        requestNumber: 1,
        customerName: "홍길동",
        customerPhone: "010-1234-5678",
        installAddress: "서울특별시 강남구 테헤란로 123",
        installDate: "2026-06-15",
        installTimeSlot: null,
        customerNote: "오후 방문 희망",
        customerTokenExpiresAt: new Date("2026-06-16T00:00:00.000Z"),
        customerSubmittedAt: null,
        status: "PENDING_INPUT",
        installationOrder: {
          id: "order-1",
          sourceErpOrderNo: "ORDER-001",
          sourceMemo: "[잇섭PICK_앱 설치] 스마트 도어락 L100 x1 / 용역 출장비 x1",
          sourceCustomerName: "홍길동",
          sourcePhone: "010-1234-5678",
          sourceAddress: "서울특별시 강남구 테헤란로 123",
          status: "WAITING_CUSTOMER_INPUT",
        },
      },
    });

    const element = await CustomerTokenPage({
      params: Promise.resolve({ token: "customer-token" }),
    });

    expect(getInstallationCustomerRequestByToken).toHaveBeenCalledWith("customer-token");
    expect(element.props.token).toBe("customer-token");
    expect(element.props.initialInfo.status).toBe("VALID");
    expect(element.props.initialInfo.request.installationOrder.sourceErpOrderNo).toBe("ORDER-001");
    expect(element.props.privacyPolicy.title).toBe("개인정보 처리방침 (요약)");
    expect(element.props.privacyPolicy.content).toContain("개인정보 수집 및 이용 항목\n휴대폰 번호");
    expect(element.props.privacyPolicyUrl).toBeUndefined();
    expect(element.props.initialToday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("renders installer response by /i/i/{token} path param", async () => {
    vi.mocked(getInstallerAssignmentByToken).mockResolvedValue({
      status: "VALID",
      assignment: {
        id: "assignment-1",
        installationOrderId: "order-1",
        customerRequestId: "customer-request-1",
        installerId: "installer-1",
        assignmentSource: "AUTO",
        installerTokenExpiresAt: new Date("2026-06-16T00:00:00.000Z"),
        status: "WAITING_INSTALLER_RESPONSE",
        installationOrder: {
          id: "order-1",
          sourceErpOrderNo: "ORDER-001",
          status: "WAITING_INSTALLER_RESPONSE",
          sourceCustomerName: null,
          sourcePhone: null,
          sourceMemo: null,
          requiredCapabilitiesText: "DOORLOCK",
          requiredAqaraAppCapability: "NONE",
          productSummary: "도어락",
          requiredCapabilities: ["DOORLOCK"],
          activeAssignmentId: "assignment-1",
          customerRequests: [
            {
              id: "customer-request-1",
              installAddress: null,
              installAddress1: null,
              installAddressDetail: null,
              installDate: "2026-06-15",
              installTimeSlot: null,
              customerPhone: null,
              ordererPhone: null,
            },
          ],
        },
      },
    });

    const element = await InstallerTokenPage({
      params: Promise.resolve({ token: "installer-token" }),
    });

    expect(getInstallerAssignmentByToken).toHaveBeenCalledWith("installer-token");
    expect(element.props.token).toBe("installer-token");
    expect(element.props.initialInfo.status).toBe("VALID");
    expect(element.props.initialInfo.assignment.id).toBe("assignment-1");
    expect(element.props.initialInfo.assignment.installerTokenExpiresAt).toBe(
      "2026-06-16T00:00:00.000Z",
    );
    expect(element.props.responseConfig.rejectionReasons).toEqual(
      expect.arrayContaining(["일정 조율 불가", "기타"]),
    );
    expect(element.props.responseConfig.dispatchNotes).toEqual(
      expect.arrayContaining([
        "수락 후 48시간 이내 고객에게 확인 전화를 진행해 주세요.",
      ]),
    );
  });
});
