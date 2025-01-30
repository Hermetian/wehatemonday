-- Add marketplace conversations table
BEGIN;

CREATE TABLE IF NOT EXISTS public.marketplace_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    raw_content TEXT NOT NULL,
    processed_content JSONB,
    status TEXT NOT NULL DEFAULT 'pending',
    created_by_id UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ticket_id TEXT,
    error_message TEXT
);

-- Add foreign key constraint separately to handle type mismatch
ALTER TABLE public.marketplace_conversations 
ADD CONSTRAINT marketplace_conversations_ticket_id_fkey 
FOREIGN KEY (ticket_id) REFERENCES public.tickets(id);

-- Add RLS policies
ALTER TABLE public.marketplace_conversations ENABLE ROW LEVEL SECURITY;

-- Staff can do everything
CREATE POLICY staff_marketplace_access 
    ON public.marketplace_conversations
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
            AND u.role IN ('ADMIN', 'MANAGER', 'AGENT')
        )
    );

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_marketplace_conversations_updated_at
    BEFORE UPDATE ON public.marketplace_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant access to authenticated users
GRANT ALL ON public.marketplace_conversations TO authenticated;

-- Create policies
CREATE POLICY "Allow service role full access" ON public.marketplace_conversations
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow users to view their own conversations" ON public.marketplace_conversations
    FOR SELECT
    TO authenticated
    USING (created_by_id = auth.uid());

COMMIT;
