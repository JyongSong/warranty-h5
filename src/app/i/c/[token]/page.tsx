import { getInstallationCustomerRequestByToken } from "@/lib/installation/customer/request";
import CustomerRequestClient from "./CustomerRequestClient";
import type { ApiInfo } from "./CustomerRequestClient";
import privacyPolicy from "./privacy-policy.json";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function InstallationCustomerTokenPage({ params }: PageProps) {
  const resolvedParams = await params;
  const token = resolvedParams.token;
  const initialState = await getInitialState(token);

  return (
    <CustomerRequestClient
      token={token}
      initialInfo={initialState.initialInfo}
      initialError={initialState.initialError}
      initialAccessBlocked={initialState.initialAccessBlocked}
      initialToday={todayKST()}
      privacyPolicy={privacyPolicy}
    />
  );
}

function todayKST() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}


async function getInitialState(token: string): Promise<{
  initialInfo: ApiInfo | null;
  initialError: string | null;
  initialAccessBlocked: boolean;
}> {
  if (!token) {
    return {
      initialInfo: null,
      initialError: null,
      initialAccessBlocked: true,
    };
  }

  const result = await getInstallationCustomerRequestByToken(token);
  if (result.status === "NOT_FOUND") {
    return {
      initialInfo: null,
      initialError: null,
      initialAccessBlocked: true,
    };
  }

  return {
    initialInfo: {
      status: result.status,
      request: result.request,
    },
    initialError: null,
    initialAccessBlocked: false,
  };
}
