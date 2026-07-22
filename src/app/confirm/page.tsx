export const dynamic = "force-dynamic";

import ConfirmClient from "./ConfirmClient";

type SP = { t?: string | string[] };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const token = typeof sp?.t === "string" ? sp.t : "";
  return <ConfirmClient token={token} />;
}
