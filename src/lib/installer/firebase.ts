import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

// firebase-admin init for installer FCM push. Requires env
// FIREBASE_SERVICE_ACCOUNT = the service-account JSON string.

export function isFcmConfigured() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
}

function getApp(): App {
  const existing = getApps();
  if (existing.length) return existing[0];

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_MISSING");

  let serviceAccount: Record<string, unknown>;
  try {
    serviceAccount = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_INVALID_JSON");
  }

  return initializeApp({ credential: cert(serviceAccount as never) });
}

export function getInstallerFcm() {
  return getMessaging(getApp());
}
