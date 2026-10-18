import crypto from "crypto";
import bcrypt from "bcryptjs";

const digest = (value) => crypto.createHash("sha256").update(String(value ?? "")).digest();

/** Constant-time username check. */
export function isValidAdminUser(username) {
  return crypto.timingSafeEqual(digest(username), digest(process.env.ADMIN_USERNAME));
}

let cachedHash = null;

async function getPasswordHash() {
  if (cachedHash) return cachedHash;
  cachedHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
  return cachedHash;
}

export async function verifyAdminPassword(password) {
  const hash = await getPasswordHash();
  return bcrypt.compare(String(password ?? ""), hash);
}
