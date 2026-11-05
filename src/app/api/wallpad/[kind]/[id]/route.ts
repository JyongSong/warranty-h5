import { handleWallpadDelete, handleWallpadWrite, preflight } from "@/lib/installation/wallpad/api";

// PUT    /api/wallpad/{models|cases|notes}/{id} — 통째로 고친다(빠진 항목은 비워진다). 키 필요.
// DELETE /api/wallpad/{models|cases|notes}/{id} — 지운다. 키 필요.
type Params = { params: Promise<{ kind: string; id: string }> };

export function OPTIONS(req: Request) {
  return preflight(req);
}

export async function PUT(req: Request, { params }: Params) {
  const { kind, id } = await params;
  return handleWallpadWrite(req, kind, id);
}

export async function DELETE(req: Request, { params }: Params) {
  const { kind, id } = await params;
  return handleWallpadDelete(req, kind, id);
}
