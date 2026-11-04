import { prisma } from "@/lib/prisma";
import { decryptPii } from "@/lib/piiCrypto";

export type BackofficeUserListItem = {
  id: string;
  supabaseUserId: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  level: number;
  lastLoginAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

function tryDecryptEmail(emailEncrypted: string) {
  try {
    return decryptPii(emailEncrypted);
  } catch {
    return "이메일 복호화 실패";
  }
}

function tryDecryptPhone(phoneEncrypted: string) {
  try {
    return decryptPii(phoneEncrypted);
  } catch {
    return null;
  }
}

export async function listBackofficeUsers(): Promise<BackofficeUserListItem[]> {
  const users = await prisma.backofficeUser.findMany({
    orderBy: [{ level: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      supabaseUserId: true,
      emailEncrypted: true,
      name: true,
      phoneEncrypted: true,
      level: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return users.map(({ emailEncrypted, phoneEncrypted, ...user }) => ({
    ...user,
    email: tryDecryptEmail(emailEncrypted),
    phone: phoneEncrypted ? tryDecryptPhone(phoneEncrypted) : null,
  }));
}
