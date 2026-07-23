import { prisma } from "@/lib/prisma";
import { decryptNullablePii } from "@/lib/piiCrypto";
import {
  inferDispatchRequirementFromMemo,
  serializeRequiredCapabilities,
} from "@/lib/installation/orders/source/source-items";

export async function getInstallationOrderStatusDetail(orderId: string) {
  const order = await prisma.installationOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      source: {
        select: {
          sourceKey: true,
          customerNameEncrypted: true,
          phoneEncrypted: true,
          addressEncrypted: true,
          dueDate: true,
          orderNumbers: true,
          noGirl: true,
          memo: true,
        },
      },
      status: true,
      activeCustomerRequestId: true,
      activeAssignmentId: true,
      currentInstallerId: true,
      currentInstaller: {
        select: {
          name: true,
          branch: true,
        },
      },
      hasOpenIssue: true,
      lastIssueId: true,
      statusChangedAt: true,
      customerRequests: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          installAddressEncrypted: true,
          installAddressDetailEncrypted: true,
          installDate: true,
          installTimeSlot: true,
          customerPhoneEncrypted: true,
          customerNote: true,
          fallbackUsed: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      assignmentAttempts: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          installerId: true,
          installer: {
            select: {
              name: true,
              branch: true,
            },
          },
          assignmentNumber: true,
          assignmentSource: true,
          status: true,
          acceptedAt: true,
          rejectedAt: true,
          rejectReason: true,
          timedOutAt: true,
          createdAt: true,
        },
      },
      statusEvents: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          eventType: true,
          actorType: true,
          actorId: true,
          reason: true,
          metadata: true,
          createdAt: true,
        },
      },
      issues: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          status: true,
          resolvedByAdminId: true,
          resolvedAt: true,
          resolutionNote: true,
          createdAt: true,
        },
      },
      notifications: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          smsType: true,
          recipientType: true,
          recipientPhoneEncrypted: true,
          assignmentAttemptId: true,
          status: true,
          providerStatus: true,
          providerStatusCode: true,
          providerReason: true,
          providerReportedAt: true,
          providerCheckedAt: true,
          errorCode: true,
          errorMessage: true,
          retryCount: true,
          deliveryCheckCount: true,
          sentAt: true,
          createdAt: true,
        },
      },
      candidateRuns: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          reasonCode: true,
          createdAt: true,
          candidates: {
            orderBy: { rank: "asc" },
            select: {
              installerId: true,
              installer: {
                select: {
                  name: true,
                  branch: true,
                },
              },
              rank: true,
              isAutoRequestCandidate: true,
              regionTier: true,
              monthlyDispatchCount: true,
              lastRequestedAt: true,
              excludedReason: true,
              decisionReason: true,
            },
          },
        },
      },
    },
  });

  if (!order) return null;

  const adminActorIds = uniqueActorIds(order.statusEvents, "ADMIN");
  const installerActorIds = uniqueActorIds(order.statusEvents, "INSTALLER");
  const [adminActors, installerActors] = await Promise.all([
    adminActorIds.length > 0
      ? prisma.backofficeUser.findMany({
          where: { id: { in: adminActorIds } },
          select: { id: true, emailEncrypted: true },
        })
      : [],
    installerActorIds.length > 0
      ? prisma.installer.findMany({
          where: { id: { in: installerActorIds } },
          select: { id: true, name: true, branch: true, phone: true },
        })
      : [],
  ]);
  const adminEmailById = new Map(
    adminActors.map((actor) => [actor.id, decryptNullablePii(actor.emailEncrypted)]),
  );
  const installerById = new Map(installerActors.map((actor) => [actor.id, actor]));

  const {
    source,
    customerRequests,
    notifications,
    statusEvents,
    ...orderFields
  } = order;

  const dispatchRequirement = inferDispatchRequirementFromMemo(source?.memo);

  return {
    ...orderFields,
    sourceErpOrderNo: source?.sourceKey ?? "",
    sourceExternalOrderNumbers: source?.orderNumbers ?? null,
    sourceNoGirl: source?.noGirl ?? null,
    sourceOrderDate: source?.dueDate ?? null,
    sourceMemo: source?.memo ?? null,
    sourceItemsJsonText: null as string | null,
    requiredCapabilities: serializeRequiredCapabilities(dispatchRequirement.requiredCapabilities),
    requiredAqaraAppCapability: dispatchRequirement.requiredAqaraAppCapability,
    sourceCustomerName: decryptNullablePii(source?.customerNameEncrypted),
    sourcePhone: decryptNullablePii(source?.phoneEncrypted),
    sourceAddress: decryptNullablePii(source?.addressEncrypted),
    statusEvents: statusEvents.map((event) => {
      const { actorId, ...eventFields } = event;
      const installer = event.actorType === "INSTALLER" && actorId
        ? installerById.get(actorId)
        : null;

      return {
        ...eventFields,
        actorEmail: event.actorType === "ADMIN" && actorId
          ? adminEmailById.get(actorId) ?? null
          : null,
        actorInstallerName: installer?.name ?? null,
        actorInstallerBranch: installer?.branch ?? null,
        actorInstallerPhone: installer?.phone ?? null,
      };
    }),
    customerRequests: customerRequests.map((request) => {
      const {
        installAddressEncrypted,
        installAddressDetailEncrypted,
        customerPhoneEncrypted,
        ...requestFields
      } = request;

      return {
        ...requestFields,
        installAddress: decryptNullablePii(installAddressEncrypted),
        installAddressDetail: decryptNullablePii(installAddressDetailEncrypted),
        customerPhone: decryptNullablePii(customerPhoneEncrypted),
      };
    }),
    notifications: notifications.map((notification) => {
      const { recipientPhoneEncrypted, ...notificationFields } = notification;

      return {
        ...notificationFields,
        recipientPhone: decryptNullablePii(recipientPhoneEncrypted),
      };
    }),
  };
}

function uniqueActorIds(
  events: Array<{ actorType: string; actorId: string | null }>,
  actorType: string,
) {
  return Array.from(
    new Set(
      events
        .filter((event) => event.actorType === actorType)
        .map((event) => event.actorId)
        .filter((actorId): actorId is string => Boolean(actorId)),
    ),
  );
}
