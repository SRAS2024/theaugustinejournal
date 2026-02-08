// src/lib/db.js
import { PrismaClient } from "@prisma/client";

let prisma;

export function getPrisma() {
  if (prisma) return prisma;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  prisma = new PrismaClient();
  return prisma;
}

export async function disconnectPrisma() {
  if (!prisma) return;
  await prisma.$disconnect();
  prisma = undefined;
}
