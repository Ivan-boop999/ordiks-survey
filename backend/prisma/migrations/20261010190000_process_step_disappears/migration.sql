-- AlterTable
-- Флаг «шаг исчезает в TO-BE» (mapTo='none' прототипа): null в map_to_step_id больше не
-- перегружен двумя смыслами — «не определено» и «исчезает».
ALTER TABLE "process_steps" ADD COLUMN "disappears" BOOLEAN NOT NULL DEFAULT false;
