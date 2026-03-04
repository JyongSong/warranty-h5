export const dynamic = "force-dynamic";

import RegClient from "./RegClient";


export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ sn?: string | string[] }>;
}) {
  const sp = await searchParams;

  let sn = "";
  const raw = sp?.sn;

  if (typeof raw === "string") {
    sn = raw;
  } else if (Array.isArray(raw)) {
    sn = raw[0] ?? "";
  }

  return <RegClient initialSn={sn} />;
}