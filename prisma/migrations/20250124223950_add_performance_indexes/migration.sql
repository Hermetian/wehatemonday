-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "Message_ticketId_idx" ON "Message"("ticketId");

-- CreateIndex
CREATE INDEX "Message_isInternal_idx" ON "Message"("isInternal");

-- CreateIndex
CREATE INDEX "Team_name_idx" ON "Team"("name");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- CreateIndex
CREATE INDEX "Ticket_priority_idx" ON "Ticket"("priority");

-- CreateIndex
CREATE INDEX "Ticket_customerId_idx" ON "Ticket"("customerId");

-- CreateIndex
CREATE INDEX "Ticket_assignedToId_idx" ON "Ticket"("assignedToId");

-- CreateIndex
CREATE INDEX "Ticket_createdById_idx" ON "Ticket"("createdById");

-- CreateIndex
CREATE INDEX "Ticket_updatedAt_idx" ON "Ticket"("updatedAt");

-- CreateIndex
CREATE INDEX "Ticket_testBatchId_idx" ON "Ticket"("testBatchId");

-- CreateIndex
CREATE INDEX "Ticket_tags_idx" ON "Ticket"("tags");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");
