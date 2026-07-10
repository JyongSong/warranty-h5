import type { BackofficeSearchParams } from "@/lib/backoffice/route";
import { renderInstallationOrderDetailPage } from "../../installations/[installationId]/page";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ installationId: string }>;
  searchParams: Promise<BackofficeSearchParams>;
};

export default async function InstallationSearchDetailPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  return renderInstallationOrderDetailPage({
    installationId: resolvedParams.installationId,
    searchParams: resolvedSearchParams,
    basePath: "/backoffice/installation-search",
  });
}
