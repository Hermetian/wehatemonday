-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "contentHtml" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "descriptionHtml" TEXT NOT NULL DEFAULT '';
