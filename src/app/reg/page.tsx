export const dynamic = "force-dynamic";

import RegClient from "./RegClient";

export default function Page({
  searchParams,
}: {
  searchParams: { sn?: string | string[] };
}) {
  const sn = typeof searchParams?.sn === "string" ? searchParams.sn : "";
  return <RegClient initialSn={sn} />;
}