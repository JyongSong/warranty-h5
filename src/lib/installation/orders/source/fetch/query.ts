import { fetchDispatchRows, type DispatchRow } from "@/lib/dispatch";

export type ErpInstallationOrderRow = DispatchRow;

export async function fetchErpInstallationOrderRows(
  from: string,
  to = from,
): Promise<ErpInstallationOrderRow[]> {
  return fetchDispatchRows(from, to);
}
