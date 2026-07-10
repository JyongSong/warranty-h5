export function getSmsLinkBaseUrl() {
  const smsLinkBaseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (smsLinkBaseUrl) return stripTrailingSlash(smsLinkBaseUrl);

  throw new Error("NEXT_PUBLIC_BASE_URL_MISSING");
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
