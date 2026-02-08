// prisma/seed.js
import { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";

const prisma = new PrismaClient();

async function main() {
  // Upsert singleton site settings (never overwrites user edits)
  await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      aboutHtml:
        "<p>The Augustine Journal is a publication dedicated to thoughtful reflection and discourse. " +
        "Founded on the principles of truth, wisdom, and intellectual inquiry, we seek to engage readers " +
        "through carefully curated essays, letters, and commentary on the matters that shape our " +
        "understanding of the world.</p>"
    }
  });

  // Create a starter notice only if none exist
  const noticeCount = await prisma.notice.count();
  if (noticeCount === 0) {
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
