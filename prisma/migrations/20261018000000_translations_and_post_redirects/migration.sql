-- DropIndex
DROP INDEX IF EXISTS "Subscriber_email_idx";

-- CreateTable
CREATE TABLE "translations" (
    "id" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "source_hash" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_redirects" (
    "slug" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_redirects_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE UNIQUE INDEX "translations_lang_source_hash_key" ON "translations"("lang", "source_hash");

-- CreateIndex
CREATE INDEX "post_redirects_post_id_idx" ON "post_redirects"("post_id");

-- AddForeignKey
ALTER TABLE "post_redirects" ADD CONSTRAINT "post_redirects_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

