-- AlterTable
ALTER TABLE "system_config" ADD COLUMN     "close_ceiling_hour" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "closed_weekday" INTEGER DEFAULT 1,
ADD COLUMN     "daily_notice" TEXT,
ADD COLUMN     "daily_notice_updated_at" TIMESTAMP(3),
ADD COLUMN     "default_close_hour" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "scheduled_close_at" TIMESTAMP(3);
