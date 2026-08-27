"use server";

import { InstallationCustomerRequestError } from "@/lib/installation/customer/errors";
import { getInstallationCustomerRequestErrorMessage } from "@/lib/installation/customer/error-message";
import { CustomerOtpError, getCustomerOtpErrorMessage } from "@/lib/installation/cj/otp";
import { lookupCjOrderNo } from "@/lib/installation/cj/manifest";
import { submitCjCustomerRequest } from "@/lib/installation/cj/submit";

export type CheckCjOrderNoResult =
  | { ok: true; orderDate: string | null }
  | { ok: false; error: string; message: string };

// 제출 전에 주문번호만 먼저 확인해 준다. 다 채우고 나서야 "주문번호가 없다"고
// 하면 그 앞의 입력이 전부 헛수고가 되기 때문이다.
export async function checkCjOrderNoAction(orderNo: string): Promise<CheckCjOrderNoResult> {
  try {
    const lookup = await lookupCjOrderNo(orderNo);

    if (lookup.status === "OK") {
      return { ok: true, orderDate: lookup.orderDate };
    }

    const error =
      lookup.status === "ALREADY_USED" ? "CJ_ORDER_NO_ALREADY_USED" : "CJ_ORDER_NO_NOT_FOUND";

    return {
      ok: false,
      error,
      message: getInstallationCustomerRequestErrorMessage(error),
    };
  } catch (error) {
    // 조회 실패를 "없는 주문번호"로 보여주면 안 된다 — 고객이 멀쩡한 번호를
    // 계속 고쳐 넣게 된다.
    console.error("[action/i/cj] order no lookup failed", error);
    return {
      ok: false,
      error: "INTERNAL_ERROR",
      message: getInstallationCustomerRequestErrorMessage("INTERNAL_ERROR"),
    };
  }
}

export type SubmitCjRequestResult =
  | { ok: true; installationId: string }
  | { ok: false; error: string; message: string };

export async function submitCjRequestAction(input: {
  orderNo: string;
  ordererPhone: string;
  ordererVerifiedToken: string;
  customerPhone: string;
  zonecode?: string;
  address: string;
  addressDetail?: string;
  installDate: string;
  installTimeSlot?: string | null;
  customerNote?: string | null;
}): Promise<SubmitCjRequestResult> {
  try {
    const submitted = await submitCjCustomerRequest({
      orderNo: input.orderNo,
      ordererPhone: input.ordererPhone,
      ordererVerifiedToken: input.ordererVerifiedToken,
      customerPhone: input.customerPhone,
      installAddress: input.address,
      installAddressDetail: input.addressDetail,
      installDate: input.installDate,
      installTimeSlot: input.installTimeSlot,
      customerNote: input.customerNote,
    });

    return { ok: true, installationId: submitted.installationOrderId };
  } catch (error) {
    if (error instanceof CustomerOtpError) {
      return {
        ok: false,
        error: error.message,
        message: getCustomerOtpErrorMessage(error.message),
      };
    }

    if (error instanceof InstallationCustomerRequestError) {
      const publicError = getPublicErrorCode(error.message);
      return {
        ok: false,
        error: publicError,
        message: getInstallationCustomerRequestErrorMessage(error.message),
      };
    }

    console.error("[action/i/cj]", error);
    return {
      ok: false,
      error: "INTERNAL_ERROR",
      message: getInstallationCustomerRequestErrorMessage("INTERNAL_ERROR"),
    };
  }
}

// 어느 입력 칸으로 되돌려 보낼지 프런트가 알 수 있도록 코드를 묶어 준다.
function getPublicErrorCode(error: string) {
  if (["INSTALL_ADDRESS_REQUIRED", "INSTALL_ADDRESS_UNPARSEABLE"].includes(error)) {
    return "INVALID_INSTALL_ADDRESS";
  }
  if (["INSTALL_DATE_INVALID", "INSTALL_DATE_OUT_OF_RANGE"].includes(error)) {
    return "INVALID_INSTALL_DATE";
  }
  if (
    [
      "CUSTOMER_PHONE_REQUIRED",
      "CUSTOMER_PHONE_IS_SAFE_NUMBER",
      "CUSTOMER_PHONE_NOT_MOBILE",
    ].includes(error)
  ) {
    return "INVALID_CUSTOMER_PHONE";
  }
  return error;
}
