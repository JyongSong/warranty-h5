// Use globalThis to persist the Map across Next.js HMR/Fast Refresh in dev mode
const globalForSmsStore = globalThis as unknown as {
  smsStore: Map<string, { code: string; expiresAt: number }>;
};

export const smsStore =
  globalForSmsStore.smsStore || new Map<string, { code: string; expiresAt: number }>();

if (process.env.NODE_ENV !== "production") {
  globalForSmsStore.smsStore = smsStore;
}
