import { prisma } from "@/lib/prisma";
import { decryptNullablePii } from "@/lib/piiCrypto";
import {
  listReviewInstallersById,
} from "@/lib/installation/installer/source";

export type ActiveInstallerRequestAssignment = Awaited<
  ReturnType<typeof listActiveInstallerRequestAssignments>
>[number];

export async function listActiveInstallerRequestAssignments({ limit = 50 }: { limit?: number } = {}) {
  const assignments = await prisma.installationInstallerAssignmentAttempt.findMany({
    where: {
      status: "WAITING_ADMIN_REVIEW",
      installationOrder: {
        status: "WAITING_ADMIN_REVIEW",
        activeAssignmentId: { not: null },
      },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      installationOrderId: true,
      customerRequestId: true,
      installerId: true,
      assignmentNumber: true,
      assignmentSource: true,
      matchTier: true,
      candidateRank: true,
      selectionSnapshot: true,
      status: true,
      createdAt: true,
      installationOrder: {
        select: {
          id: true,
          source: {
            select: {
              sourceKey: true,
              customerNameEncrypted: true,
              phoneEncrypted: true,
              addressEncrypted: true,
            },
          },
          status: true,
          activeAssignmentId: true,
          customerRequests: {
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: {
              id: true,
              installAddressEncrypted: true,
              installDate: true,
              installTimeSlot: true,
              customerPhoneEncrypted: true,
              customerNote: true,
              fallbackUsed: true,
              status: true,
            },
          },
        },
      },
    },
  });

  const activeAssignments = assignments.filter(
    (assignment) => assignment.installationOrder.activeAssignmentId === assignment.id,
  );

  const installerIds = Array.from(
    new Set(activeAssignments.map((assignment) => assignment.installerId).filter(Boolean)),
  );
  const installerById = await listReviewInstallersById(installerIds);

  return activeAssignments.map((assignment) => {
    const {
      source,
      customerRequests,
      ...installationOrderFields
    } = assignment.installationOrder;

    return {
      ...assignment,
      installationOrder: {
        ...installationOrderFields,
        sourceErpOrderNo: source?.sourceKey ?? "",
        sourceCustomerName: decryptNullablePii(source?.customerNameEncrypted),
        sourcePhone: decryptNullablePii(source?.phoneEncrypted),
        sourceAddress: decryptNullablePii(source?.addressEncrypted),
        customerRequests: customerRequests.map((request) => {
          const { installAddressEncrypted, customerPhoneEncrypted, ...requestFields } = request;

          return {
            ...requestFields,
            installAddress: decryptNullablePii(installAddressEncrypted),
            customerPhone: decryptNullablePii(customerPhoneEncrypted),
          };
        }),
      },
      installer: installerById.get(assignment.installerId) ?? formatMissingInstaller(assignment.installerId),
    };
  });
}

function formatMissingInstaller(installerId: string) {
  return {
    businessNumber: installerId,
    branchName: installerId,
    phone: null,
    installationRegion: null,
    possibleRegion: null,
    impossibleRegion: null,
  };
}
