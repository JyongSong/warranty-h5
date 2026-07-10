export function parseProductSummaryItems(value: string | null | undefined) {
  return (value ?? "")
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = /\s+x(\d+(?:\.\d+)?)$/.exec(item);
      if (!match) return { name: item, quantity: 1 };

      return {
        name: item.slice(0, match.index).trim(),
        quantity: Number(match[1]),
      };
    })
    .filter((item) => item.name.length > 0);
}
