-- AlterTable
-- updatedAt у комментариев: правка своего комментария меняет дату, DTO отдаёт обе.
ALTER TABLE "comments" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
