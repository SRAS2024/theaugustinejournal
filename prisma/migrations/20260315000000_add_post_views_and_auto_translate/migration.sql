-- AlterTable
ALTER TABLE "Post" ADD COLUMN "view_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Post" ADD COLUMN "auto_translate_title" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "post_views" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "viewer_identifier" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "post_views_post_id_viewer_identifier_key" ON "post_views"("post_id", "viewer_identifier");

-- AddForeignKey
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
