-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('BLOG', 'LETTER');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('RICH', 'PDF');

-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "aboutHtml" TEXT NOT NULL DEFAULT '<p>The Augustine Journal is a publication dedicated to thoughtful reflection and discourse. Founded on the principles of truth, wisdom, and intellectual inquiry, we seek to engage readers through carefully curated essays, letters, and commentary on the matters that shape our understanding of the world.</p>',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "PostType" NOT NULL,
    "title" TEXT NOT NULL,
    "postDate" TIMESTAMP(3) NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "contentHtml" TEXT NOT NULL DEFAULT '',
    "pdfPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");

-- CreateIndex
CREATE INDEX "Post_type_postDate_idx" ON "Post"("type", "postDate");

-- CreateIndex
CREATE INDEX "Post_postDate_idx" ON "Post"("postDate");
