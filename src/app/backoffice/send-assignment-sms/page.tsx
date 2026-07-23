import { requireAdminPage } from "@/lib/adminAuth";
import SendAssignmentSmsClient from "./SendAssignmentSmsClient";

export const dynamic = "force-dynamic";

export default async function BackofficeSendAssignmentSmsPage() {
  await requireAdminPage("/backoffice/send-assignment-sms");
  return <SendAssignmentSmsClient />;
}
