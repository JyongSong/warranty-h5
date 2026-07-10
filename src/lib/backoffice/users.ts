import { prisma } from "@/lib/prisma";
import { decryptPii } from "@/lib/piiCrypto";

export type BackofficeUserListItem = {
  id: string;
  supabaseUserId: string | null;
  email: string;
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

export async function listBackofficeUsers(): Promise<BackofficeUserListItem[]> {
  const users = await prisma.backofficeUser.findMany({
    orderBy: [{ level: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      supabaseUserId: true,
      emailEncrypted: true,
      level: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return users.map(({ emailEncrypted, ...user }) => ({
    ...user,
    email: tryDecryptEmail(emailEncrypted),
  }));
}
