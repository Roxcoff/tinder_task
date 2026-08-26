import crypto from "crypto";
import { cookies } from "next/headers";

const SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const COOKIE_NAME = "ttt_session";

function sign(value) {
  const h = crypto.createHmac("sha256", SECRET).update(value).digest("hex");
  return `${value}.${h}`;
}

function verify(signed) {
  if (!signed) return null;
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac("sha256", SECRET).update(value).digest("hex");
  if (sig.length !== expected.length) return null;
  try {
    const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    return ok ? value : null;
  } catch {
    return null;
  }
}

export function setSessionCookie(userId) {
  cookies().set(COOKIE_NAME, sign(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180, // 180 jours
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE_NAME);
}

export function getSessionUserId() {
  const raw = cookies().get(COOKIE_NAME)?.value;
  return verify(raw);
}
