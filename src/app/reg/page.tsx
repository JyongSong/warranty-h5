export const dynamic = "force-dynamic";

import RegClient from "./RegClient";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ sn?: string | string[] }>;
}) {
  const sp = await searchParams;
  const sn = typeof sp?.sn === "string" ? sp.sn : "";
  return <RegClient initialSn={sn} />;
}