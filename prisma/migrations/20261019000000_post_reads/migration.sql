-- Reads replace views. "Post"."view_count" keeps its numbers and now counts
-- reads; "post_views" is kept as history and is no longer written.
-- reader_key is a keyed hash that includes the post, so rows of different
-- posts cannot be linked; network_tag is a 16-bit keyed tag of the network
-- (for the daily per-network cap), too short to identify one.

-- CreateTable
CREATE TABLE "post_reads" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "reader_key" TEXT NOT NULL,
    "ticket_hash" TEXT,
    "network_tag" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "post_reads_post_id_reader_key_key" ON "post_reads"("post_id", "reader_key");

-- CreateIndex (a read ticket counts at most once)
CREATE UNIQUE INDEX "post_reads_ticket_hash_key" ON "post_reads"("ticket_hash");

-- CreateIndex (reads of a post from one network in the last day)
CREATE INDEX "post_reads_post_id_network_tag_created_at_idx" ON "post_reads"("post_id", "network_tag", "created_at");

-- AddForeignKey
ALTER TABLE "post_reads" ADD CONSTRAINT "post_reads_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
