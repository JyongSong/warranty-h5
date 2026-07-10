import { getInstallerAssignmentByToken } from "@/lib/installation/installer/response";
import InstallerResponseClient from "./InstallerResponseClient";
import type { ApiInfo } from "./InstallerResponseClient";
import responseConfig from "./response-config.json";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function InstallationInstallerTokenPage({ params }: PageProps) {
  const resolvedParams = await params;
  const token = resolvedParams.token;
  const initialState = await getInitialState(token);

  return (
    <InstallerResponseClient
      token={token}
      initialInfo={initialState.initialInfo}
      initialError={initialState.initialError}
      initialAccessBlocked={initialState.initialAccessBlocked}
      responseConfig={responseConfig}
    />
  );
}

async function getInitialState(token: string): Promise<{
  initialInfo: ApiInfo | null;
  initialError: string | null;
  initialAccessBlocked: boolean;
}> {
  if (!token) {
    return { initialInfo: null, initialError: null, initialAccessBlocked: true };
  }

  const result = await getInstallerAssignmentByToken(token);
  if (result.status === "NOT_FOUND") {
    return { initialInfo: null, initialError: null, initialAccessBlocked: true };
  }

  return {
    initialInfo: {
      status: result.status,
      assignment: {
        ...result.assignment,
        installerTokenExpiresAt: result.assignment.installerTokenExpiresAt?.toISOString() ?? null,
      },
    },
    initialError: null,
    initialAccessBlocked: false,
  };
}
