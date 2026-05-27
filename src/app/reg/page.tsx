import RegClient from "./RegClient";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ sn?: string }>;
}

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const sn = resolvedSearchParams.sn ?? "";
  return <RegClient initialSn={sn} />;
}

