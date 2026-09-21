-- AlterTable
ALTER TABLE "whatsapp_conversations" ADD COLUMN     "handoff_at" TIMESTAMP(3),
ADD COLUMN     "last_read_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN     "sent_by_name" TEXT;
