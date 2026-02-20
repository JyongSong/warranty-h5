export const dynamic = "force-dynamic";

import ConfirmClient from "./ConfirmClient";

export default function Page({
  searchParams,
}: {
  searchParams: { t?: string };
}) {
  const token = typeof searchParams.t === "string" ? searchParams.t : "";
  return <ConfirmClient token={token} />;
}