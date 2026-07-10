import { prisma } from "@/lib/prisma";

type ResolveInstallationIssueInput = {
  adminId: string;
  note: string;
  now?: Date;
};

type InstallationIssueResolveClient = {
  $transaction: <T>(callback: (tx: InstallationIssueResolveTransaction) => Promise<T>) => Promise<T>;
};

type InstallationIssueResolveTransaction = {
  installationIssue: {
    findUnique: (args: unknown) => Promise<{
      id: string;
      installationOrderId: string;
      status: string;
      title: string;
      installationOrder: {
        id: string;
        status: string;
      };
    } | null>;
    update: (args: unknown) => Promise<{ id: string; status: string }>;
    count: (args: unknown) => Promise<number>;
  };
  installationOrder: {
    update: (args: unknown) => Promise<unknown>;
  };
  installationOrderStatusEvent: {
    create: (args: unknown) => Promise<unknown>;
  };
};

export class InstallationIssueResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallationIssueResolveError";
  }
}

export async function resolveInstallationIssue(
  issueId: string,
  input: ResolveInstallationIssueInput,
  client: InstallationIssueResolveClient = prisma as unknown as InstallationIssueResolveClient,
) {
  const normalizedIssueId = issueId.trim();
  const normalizedAdminId = input.adminId.trim();
  const normalizedNote = input.note.trim();
  const now = input.now ?? new Date();

  if (!normalizedIssueId) throw new InstallationIssueResolveError("ISSUE_ID_REQUIRED");
  if (!normalizedAdminId) throw new InstallationIssueResolveError("ADMIN_ID_REQUIRED");
  if (!normalizedNote) throw new InstallationIssueResolveError("RESOLUTION_NOTE_REQUIRED");

  return client.$transaction(async (tx) => {
    const issue = await tx.installationIssue.findUnique({
      where: { id: normalizedIssueId },
      select: {
        id: true,
        installationOrderId: true,
        status: true,
        title: true,
        installationOrder: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!issue) throw new InstallationIssueResolveError("ISSUE_NOT_FOUND");
    if (issue.status !== "OPEN") {
      throw new InstallationIssueResolveError("ISSUE_ALREADY_RESOLVED");
    }

    const resolvedIssue = await tx.installationIssue.update({
      where: { id: normalizedIssueId },
      data: {
        status: "RESOLVED",
        resolvedByAdminId: normalizedAdminId,
        resolvedAt: now,
        resolutionNote: normalizedNote,
        updatedAt: now,
      },
      select: {
        id: true,
        status: true,
      },
    });

    const remainingOpenIssueCount = await tx.installationIssue.count({
      where: {
        installationOrderId: issue.installationOrderId,
        status: "OPEN",
      },
    });

    if (remainingOpenIssueCount === 0) {
      await tx.installationOrder.update({
        where: { id: issue.installationOrderId },
        data: { hasOpenIssue: false },
      });
    }

    await tx.installationOrderStatusEvent.create({
      data: {
        installationOrderId: issue.installationOrderId,
        fromStatus: issue.installationOrder.status,
        toStatus: issue.installationOrder.status,
        eventType: "ISSUE_RESOLVED",
        actorType: "ADMIN",
        actorId: normalizedAdminId,
        reason: normalizedNote,
        metadata: {
          issueId: issue.id,
          issueTitle: issue.title,
        },
        createdAt: now,
      },
    });

    return resolvedIssue;
  });
}
