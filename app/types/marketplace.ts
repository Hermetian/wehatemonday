export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface MarketplaceConversation {
  id: string;
  raw_content: string;
  processed_content: Record<string, unknown> | null;
  status: ProcessingStatus;
  created_by_id: string;
  created_at: string;
  updated_at: string;
  ticket_id: string | null;
  error_message: string | null;
}

export interface MarketplaceInput {
  rawContent: string;
}

export interface ProcessedTicket {
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  tags: string[];
}
