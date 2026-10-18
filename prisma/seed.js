// prisma/seed.js
import { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";

const prisma = new PrismaClient();

async function main() {
  // A fresh database gets the default site text and one example notice.
  // Existing sites are never changed (deleting every notice stays deleted).
  const existing = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  if (existing) return;

  await prisma.siteSettings.create({
    data: {
      id: 1,
      aboutHtml:
        "<p>The Augustine Journal is a publication dedicated to thoughtful reflection and discourse. " +
        "Founded on the principles of truth, wisdom, and intellectual inquiry, we seek to engage readers " +
        "through carefully curated essays, letters, and commentary on the matters that shape our " +
        "understanding of the world.</p>"
    }
  });

  if ((await prisma.notice.count()) === 0) {
    await prisma.notice.create({
      data: {
        id: nanoid(),
        message: "Welcome to The Augustine Journal. This is an example notice.",
        order: 1
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed completed.");
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
