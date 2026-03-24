-- CreateTable
CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "throwback_tracker" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "last_sent_post_id" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "throwback_tracker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_email_key" ON "Subscriber"("email");

-- CreateIndex
CREATE INDEX "Subscriber_email_idx" ON "Subscriber"("email");

-- CreateIndex
CREATE INDEX "email_logs_type_sent_at_idx" ON "email_logs"("type", "sent_at");
