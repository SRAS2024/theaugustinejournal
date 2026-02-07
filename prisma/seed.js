import { PrismaClient } from "@prisma/client";
import { nanoid } from "nanoid";

const prisma = new PrismaClient();

async function main() {
  await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      aboutHtml:
        "<p>The Augustine Journal is a publication dedicated to thoughtful reflection and discourse. Founded on the principles of truth, wisdom, and intellectual inquiry, we seek to engage readers through carefully curated essays, letters, and commentary on the matters that shape our understanding of the world.</p>"
    }
  });

  const existingNotices = await prisma.notice.count();
  if (existingNotices === 0) {
    await prisma.notice.createMany({
      data: [
        { id: nanoid(), message: "Welcome to The Augustine Journal. This is an example notice.", order: 1 }
      ]
    });
  }

  const existingPosts = await prisma.post.count();
  if (existingPosts === 0) {
    const now = new Date();

    await prisma.post.createMany({
      data: [
        {
          id: nanoid(),
          slug: "welcome-blog",
          type: "BLOG",
          title: "Welcome to the Blog",
          postDate: now,
          contentType: "RICH",
          contentHtml: "<p>This is an example blog post. You can edit or delete it in the admin panel.</p>"
        },
        {
          id: nanoid(),
          slug: "welcome-essay",
          type: "ESSAY",
          title: "Welcome Essay",
          postDate: now,
          contentType: "RICH",
          contentHtml: "<p>This is an example essay. Essays appear in their own section in the navigation.</p>"
        },
        {
          id: nanoid(),
          slug: "welcome-letter",
          type: "LETTER",
          title: "Welcome Letter",
          postDate: now,
          contentType: "RICH",
          contentHtml: "<p>This is an example letter. Letters appear in their own section in the navigation.</p>"
        }
      ]
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
