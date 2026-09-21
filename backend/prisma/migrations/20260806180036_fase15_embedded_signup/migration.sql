-- AlterTable
ALTER TABLE "whatsapp_conversations" ADD COLUMN     "human_replied_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "whatsapp_business_accounts" (
    "id" SERIAL NOT NULL,
    "waba_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "display_phone_number" TEXT,
    "verified_name" TEXT,
    "access_token" TEXT NOT NULL,
    "is_coexistence" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "connected_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_business_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_business_accounts_waba_id_key" ON "whatsapp_business_accounts"("waba_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_business_accounts_phone_number_id_key" ON "whatsapp_business_accounts"("phone_number_id");
