-- Migration to add created_by_id to messages table
-- Description: Adds a nullable created_by_id column to messages table with foreign key to users

-- Up Migration
ALTER TABLE public.messages DROP COLUMN IF EXISTS created_by_id;
ALTER TABLE public.messages ADD COLUMN created_by_id uuid;
ALTER TABLE public.messages 
    ADD CONSTRAINT fk_messages_created_by 
    FOREIGN KEY (created_by_id) 
    REFERENCES public.users(id)
    ON DELETE CASCADE;
CREATE INDEX idx_messages_created_by ON public.messages(created_by_id);

/*
-- Down Migration (commented out to prevent accidental execution)
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS fk_messages_created_by;
DROP INDEX IF EXISTS idx_messages_created_by;
ALTER TABLE public.messages DROP COLUMN IF EXISTS created_by_id;
*/ 
