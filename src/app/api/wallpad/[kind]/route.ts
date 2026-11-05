import { handleWallpadWrite, preflight } from "@/lib/installation/wallpad/api";

// POST /api/wallpad/{models|cases|notes} — 새로 만든다. 키 필요.
export function OPTIONS(req: Request) {
  return preflight(req);
}

export async function POST(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  return handleWallpadWrite(req, kind, null);
}
