import { prisma } from "@/lib/prisma";

type CreateInstallationIssueInput = {
  installationOrderId: string;
  type: string;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  now?: Date;
};

type InstallationIssueClient = {
  installationIssue: {
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: unknown) => Promise<{ id: string }>;
    update: (args: unknown) => Promise<{ id: string }>;
  };
  installationOrder: {
    update: (args: unknown) => Promise<unknown>;
  };
};

export async function createInstallationIssue(
  input: CreateInstallationIssueInput,
  client: InstallationIssueClient = prisma as unknown as InstallationIssueClient,
) {
  const now = input.now ?? new Date();
  const existingIssue = await client.installationIssue.findFirst({
    where: {
      installationOrderId: input.installationOrderId,
      type: input.type,
      status: "OPEN",
    },
    select: { id: true },
  });
  const issue = existingIssue
    ? await client.installationIssue.update({
        where: { id: existingIssue.id },
        data: {
          title: input.title,
          description: input.description ?? null,
          metadata: input.metadata ?? {},
          updatedAt: now,
        },
        select: { id: true },
      })
    : await client.installationIssue.create({
        data: {
          installationOrderId: input.installationOrderId,
          type: input.type,
          title: input.title,
          description: input.description ?? null,
          metadata: input.metadata ?? {},
          status: "OPEN",
          createdAt: now,
          updatedAt: now,
        },
        select: { id: true },
      });

  await client.installationOrder.update({
    where: { id: input.installationOrderId },
    data: {
      hasOpenIssue: true,
      lastIssueId: issue.id,
    },
  });

  return issue;
}
