import bcrypt from "bcryptjs";

export function isValidAdminUser(username) {
  return username === process.env.ADMIN_USERNAME;
}

let cachedHash = null;

async function getPasswordHash() {
  if (cachedHash) return cachedHash;
  cachedHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
  return cachedHash;
}

export async function verifyAdminPassword(password) {
  const hash = await getPasswordHash();
  return bcrypt.compare(password, hash);
}
