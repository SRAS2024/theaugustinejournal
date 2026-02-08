import bcrypt from "bcryptjs";

const ADMIN_USERNAME = "Ryan Simonds";
const ADMIN_PASSWORD = "Santidade";

export function isValidAdminUser(username) {
  return username === ADMIN_USERNAME;
}

let cachedHash = null;

async function getPasswordHash() {
  if (cachedHash) return cachedHash;
  cachedHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  return cachedHash;
}

export async function verifyAdminPassword(password) {
  const hash = await getPasswordHash();
  return bcrypt.compare(password, hash);
}
