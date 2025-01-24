/*
  Warnings:

  - A unique constraint covering the columns `[email,testBatchId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "User_email_testBatchId_key" ON "User"("email", "testBatchId");
