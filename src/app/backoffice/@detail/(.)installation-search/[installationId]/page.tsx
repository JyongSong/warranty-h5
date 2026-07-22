import type { BackofficeSearchParams } from "@/lib/backoffice/route";
import InstallationOrderDetailPanel from "@/app/backoffice/InstallationOrderDetailPanel";
import { renderInstallationOrderDetailPage } from "@/app/backoffice/installations/[installationId]/page";

type PageProps = {
  params: Promise<{ installationId: string }>;
  searchParams: Promise<BackofficeSearchParams>;
};

export default async function InstallationSearchDetailPanelPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  return (
    <InstallationOrderDetailPanel>
      {await renderInstallationOrderDetailPage({
        installationId: resolvedParams.installationId,
        searchParams: resolvedSearchParams,
        basePath: "/backoffice/installation-search",
        displayMode: "panel",
      })}
    </InstallationOrderDetailPanel>
  );
}
