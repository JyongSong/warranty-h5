export const dynamic = "force-dynamic";

import ConfirmClient from "./ConfirmClient";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const sp = await searchParams;
  const token = typeof sp?.t === "string" ? sp.t : "";
  return <ConfirmClient token={token} />;
}