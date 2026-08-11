import { prisma } from "@/lib/prisma";
import {
  InstallerResponseError,
  respondInstallerAssignment,
} from "@/lib/installation/installer/response";

// Session-authorized accept/reject. Verifies the attempt belongs to the
// logged-in installer, then delegates to the existing token-based state machine
// by passing the attempt's stored token hash (tokenIsHash), so all side effects
// (accept SMS, auto-reassign, issues) are reused unchanged. Keeps the legacy
// token path intact for old SMS links (PRD §6.5).
export async function respondToAssignmentAsInstaller(
  installerId: string,
  attemptId: string,
  input: { response: "ACCEPT" | "REJECT"; rejectReason?: string | null },
) {
  const attempt = await prisma.installationInstallerAssignmentAttempt.findUnique({
    where: { id: attemptId },
    select: { id: true, installerId: true, installerTokenHash: true },
  });

  if (!attempt || attempt.installerId !== installerId) {
    throw new InstallerResponseError("NOT_YOUR_ASSIGNMENT");
  }
  if (!attempt.installerTokenHash) {
    throw new InstallerResponseError("ASSIGNMENT_TOKEN_MISSING");
  }

  await respondInstallerAssignment(attempt.installerTokenHash, {
    response: input.response,
    rejectReason: input.rejectReason ?? null,
    tokenIsHash: true,
  });
}

export { InstallerResponseError };
