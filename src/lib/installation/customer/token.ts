import { createHash } from "crypto";

export function hashInstallationCustomerToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
