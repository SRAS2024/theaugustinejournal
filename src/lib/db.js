import { PrismaClient } from "@prisma/client";

/**
 * Lazy, safe Prisma initialization.
 * This prevents the app from crashing at import time if DATABASE_URL is missing
 * or if Prisma cannot connect during boot.
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
