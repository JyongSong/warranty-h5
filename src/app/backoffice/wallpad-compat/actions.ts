"use server";

import { requireAdminApi } from "@/lib/adminAuth";
import {
  WallpadCompatError,
  deleteWallpadCase,
  deleteWallpadModel,
  deleteWallpadNote,
  saveWallpadCase,
  saveWallpadModel,
  saveWallpadNote,
  type WallpadCaseInput,
  type WallpadModelInput,
  type WallpadNoteInput,
} from "@/lib/installation/wallpad/service";

type ActionResult = { ok: true } | { ok: false; error: string };

async function run(task: (adminId: string) => Promise<void>): Promise<ActionResult> {
  const { admin, errorResponse } = await requireAdminApi(1);
  if (errorResponse || !admin) return { ok: false, error: "UNAUTHORIZED" };
  try {
    await task(admin.id);
    return { ok: true };
  } catch (error) {
    if (error instanceof WallpadCompatError) return { ok: false, error: error.message };
    console.error("[backoffice/wallpad-compat]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }
}

export async function saveWallpadModelAction(input: WallpadModelInput): Promise<ActionResult> {
  return run((adminId) => saveWallpadModel(input, adminId));
}

export async function deleteWallpadModelAction(id: string): Promise<ActionResult> {
  return run(() => deleteWallpadModel(String(id ?? "")));
}

export async function saveWallpadCaseAction(input: WallpadCaseInput): Promise<ActionResult> {
  return run((adminId) => saveWallpadCase(input, adminId));
}

export async function deleteWallpadCaseAction(id: string): Promise<ActionResult> {
  return run(() => deleteWallpadCase(String(id ?? "")));
}

export async function saveWallpadNoteAction(input: WallpadNoteInput): Promise<ActionResult> {
  return run(() => saveWallpadNote(input));
}

export async function deleteWallpadNoteAction(id: string): Promise<ActionResult> {
  return run(() => deleteWallpadNote(String(id ?? "")));
}
