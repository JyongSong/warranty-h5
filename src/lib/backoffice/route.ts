export type BackofficeSearchParams = Record<string, string | string[] | undefined>;

export function buildBackofficeNextPath(
  pathname: string,
  searchParams: BackofficeSearchParams = {},
) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      query.append(key, value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, item);
      }
    }
  }

  const queryString = query.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}
