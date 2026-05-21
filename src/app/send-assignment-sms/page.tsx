import { requireAdminPage } from "@/lib/adminAuth";
import SendAssignmentSmsClient from "./SendAssignmentSmsClient";

export const dynamic = "force-dynamic";

export default async function SendAssignmentSmsPage() {
  await requireAdminPage("/send-assignment-sms");
  return <SendAssignmentSmsClient />;
}
