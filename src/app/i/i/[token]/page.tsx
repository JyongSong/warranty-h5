import { getInstallerAssignmentByToken } from "@/lib/installation/installer/response";
import { listInstallerDeviceTokens } from "@/lib/installer/devices";
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
      showAppInstallGuide={initialState.showAppInstallGuide}
      responseConfig={responseConfig}
    />
  );
}

async function getInitialState(token: string): Promise<{
  initialInfo: ApiInfo | null;
  initialError: string | null;
  initialAccessBlocked: boolean;
  showAppInstallGuide: boolean;
}> {
  if (!token) {
    return {
      initialInfo: null,
      initialError: null,
      initialAccessBlocked: true,
      showAppInstallGuide: false,
    };
  }

  const result = await getInstallerAssignmentByToken(token);
  if (result.status === "NOT_FOUND") {
    return {
      initialInfo: null,
      initialError: null,
      initialAccessBlocked: true,
      showAppInstallGuide: false,
    };
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
    showAppInstallGuide: await hasNoAppDevice(result.assignment.installerId),
  };
}

// 앱 기기가 없는 기사에게만 앱 설치 안내를 보여 준다. 조회 실패는 안내 없이 넘어간다.
async function hasNoAppDevice(installerId: string) {
  try {
    return (await listInstallerDeviceTokens(installerId)).length === 0;
  } catch (error) {
    console.error("[installer-response/app-install-guide]", error);
    return false;
  }
}
