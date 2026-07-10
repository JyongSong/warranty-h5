"use server";

import {
  InstallationCustomerRequestError,
  submitInstallationCustomerRequest,
} from "@/lib/installation/customer/request";
import { getInstallationCustomerRequestErrorMessage } from "@/lib/installation/customer/error-message";

export type SubmitCustomerRequestResult =
  | { ok: true; installationId: string; status: "READY_FOR_CANDIDATE_SELECTION" }
  | { ok: false; error: string; message: string };

export async function submitCustomerRequestAction(input: {
  token: string;
  installAddress?: string;
  zonecode?: string;
  address?: string;
  addressDetail?: string;
  installDate: string;
  installTimeSlot?: string | null;
  customerPhone: string;
  customerNote?: string | null;
}): Promise<SubmitCustomerRequestResult> {
  const token = input.token.trim();
  if (!token) {
    return {
      ok: false,
      error: "MISSING_TOKEN",
      message: getInstallationCustomerRequestErrorMessage("MISSING_TOKEN"),
    };
  }

  try {
    const request = await submitInstallationCustomerRequest(token, {
      installAddress: getBaseInstallAddress(input),
      installAddressDetail: input.addressDetail,
      installDate: input.installDate,
      installTimeSlot: input.installTimeSlot,
      customerPhone: input.customerPhone,
      customerNote: input.customerNote,
    });

    return {
      ok: true,
      installationId: request.installationOrderId,
      status: "READY_FOR_CANDIDATE_SELECTION",
    };
  } catch (error) {
    if (error instanceof InstallationCustomerRequestError) {
      const publicError = getPublicCustomerRequestErrorCode(error.message);
      return {
        ok: false,
        error: publicError,
        message: getInstallationCustomerRequestErrorMessage(error.message),
      };
    }

    console.error("[action/i/c]", error);
    return {
      ok: false,
      error: "INTERNAL_ERROR",
      message: getInstallationCustomerRequestErrorMessage("INTERNAL_ERROR"),
    };
  }
}

function getBaseInstallAddress(input: {
  installAddress?: string;
  address?: string;
}) {
  if (input.installAddress?.trim()) {
    return input.installAddress;
  }

  return input.address?.trim() ?? "";
}

function getPublicCustomerRequestErrorCode(error: string) {
  if (["INSTALL_ADDRESS_REQUIRED", "INSTALL_ADDRESS_UNPARSEABLE"].includes(error)) {
    return "INVALID_INSTALL_ADDRESS";
  }
  if (["INSTALL_DATE_INVALID", "INSTALL_DATE_OUT_OF_RANGE"].includes(error)) {
    return "INVALID_INSTALL_DATE";
  }
  if (error === "CUSTOMER_PHONE_REQUIRED") {
    return "INVALID_CUSTOMER_PHONE";
  }
  return error;
}
