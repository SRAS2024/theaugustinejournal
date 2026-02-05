import { Router } from "express";
import { prisma } from "../lib/db.js";

const router = Router();

async function getCommon() {
  const [settings, notices] = await Promise.all([
    prisma.siteSettings.findUnique({ where: { id: 1 } }),
    prisma.notice.findMany({ orderBy: { order: "asc" }, take: 3 })
  ]);
  return { settings, notices };
}

router.get("/", async (req, res) => {
  const { settings, notices } = await getCommon();

  const latest = await prisma.post.findFirst({
    orderBy: [{ postDate: "desc" }, { createdAt: "desc" }]
  });

  res.render("home", {
    settings,
    notices,
    latest
  });
});

router.get("/blog", async (req, res) => {
  const { settings, notices } = await getCommon();
  const posts = await prisma.post.findMany({
    where: { type: "BLOG" },
    orderBy: [{ postDate: "desc" }, { createdAt: "desc" }]
  });

  res.render("list", {
    pageTitle: "Blog",
    settings,
    notices,
    posts
  });
});

router.get("/letters", async (req, res) => {
  const { settings, notices } = await getCommon();
  const posts = await prisma.post.findMany({
    where: { type: "LETTER" },
    orderBy: [{ postDate: "desc" }, { createdAt: "desc" }]
  });

  res.render("list", {
    pageTitle: "Letters",
    settings,
    notices,
    posts
  });
});

router.get("/post/:slug", async (req, res) => {
  const { settings, notices } = await getCommon();

  const post = await prisma.post.findUnique({
    where: { slug: req.params.slug }
  });

  if (!post) return res.status(404).send("Post not found.");

  res.render("post", {
    settings,
    notices,
    post
  });
});

export default router;
