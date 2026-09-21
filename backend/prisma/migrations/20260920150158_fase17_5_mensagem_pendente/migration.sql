-- CreateEnum
CREATE TYPE "MessageDeliveryStatus" AS ENUM ('PENDENTE', 'ENVIADA', 'FALHOU');

-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN     "delivery_status" "MessageDeliveryStatus",
ADD COLUMN     "failure_reason" TEXT;
