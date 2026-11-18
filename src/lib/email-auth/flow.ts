import { createHmac, timingSafeEqual } from "node:crypto";
import { safeDestination } from "../safe-destination";
import { OPAQUE_TOKEN, UUID, type EmailAuthConfig } from "./policy";

export type EmailFlow = {
  emailHash: string;
  intakeId: string | null;
  next: string;
  verifier: string;
  expiresAt: number;
};

export function recipientHash(config: EmailAuthConfig, email: string): string {
  return createHmac("sha256", config.secret).update(`email\0${config.provider}\0${email}`).digest("hex");
}

export function ingressHash(config: EmailAuthConfig, ip: string): string {
  return createHmac("sha256", config.secret).update(`ip\0${ip}`).digest("hex");
}

function flowMac(config: EmailAuthConfig, payload: string): Buffer {
  return createHmac("sha256", config.secret).update(`flow\0${config.origin}\0${config.provider}\0${payload}`).digest();
}

/** Only the short-lived HttpOnly cookie holds the verifier and signed intent; no raw email. */
export function signEmailFlow(config: EmailAuthConfig, flow: EmailFlow): string {
  const payload = Buffer.from(JSON.stringify(flow)).toString("base64url");
  return `${payload}.${flowMac(config, payload).toString("base64url")}`;
}

export function readEmailFlow(config: EmailAuthConfig, cookie: string | undefined): EmailFlow | null {
  if (!cookie || cookie.length > 2048) return null;
  const [payload, sig, extra] = cookie.split(".");
  if (!payload || !sig || extra !== undefined || !OPAQUE_TOKEN.test(sig) || !timingSafeEqual(flowMac(config, payload), Buffer.from(sig, "base64url"))) return null;
  try {
    const flow = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as EmailFlow;
    if (!flow || !/^[a-f\d]{64}$/.test(flow.emailHash) || !OPAQUE_TOKEN.test(flow.verifier) ||
      !Number.isSafeInteger(flow.expiresAt) || flow.expiresAt <= Date.now() ||
      (flow.intakeId !== null && (typeof flow.intakeId !== "string" || !UUID.test(flow.intakeId))) || flow.next !== safeDestination(flow.next)) return null;
    return flow;
  } catch {
    return null;
  }
}
