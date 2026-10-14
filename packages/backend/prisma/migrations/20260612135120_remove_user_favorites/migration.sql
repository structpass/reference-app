/*
  Warnings:

  - You are about to drop the `user_favorites` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "user_favorites" DROP CONSTRAINT "user_favorites_user_id_fkey";

-- DropTable
DROP TABLE "user_favorites";
