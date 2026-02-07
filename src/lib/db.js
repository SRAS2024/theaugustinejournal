import { PrismaClient } from "@prisma/client";

/**
 * Lazy, safe Prisma initialization.
 * Keeps Prisma from being created at import time.
 */

let prisma;

/**
 * Returns a singleton PrismaClient instance.
 * Throws a clear error if DATABASE_URL is missing.
 */
export function getPrisma() {
  if (prisma) return prisma;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  prisma = new PrismaClient();
  return prisma;
}

/**
 * Optional helper for graceful shutdown.
 * Safe to call even if Prisma was never initialized.
 */
export async function disconnectPrisma() {
  if (!prisma) return;
  await prisma.$disconnect();
  prisma = undefined;
}
