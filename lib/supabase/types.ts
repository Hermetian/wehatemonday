export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string | null
          clade: 'ADMIN' | 'MANAGER' | 'AGENT' | 'CUSTOMER'
          created_at: string
          updated_at: string
          cleanup_at: string | null
          metadata: Json | null
          test_batch_id: string | null
        }
        Insert: {
          email: string
          name?: string | null
          clade?: 'ADMIN' | 'MANAGER' | 'AGENT' | 'CUSTOMER'
          cleanup_at?: string | null
          metadata?: Json | null
          test_batch_id?: string | null
        }
        Update: {
          email?: string
          name?: string | null
          clade?: 'ADMIN' | 'MANAGER' | 'AGENT' | 'CUSTOMER'
          cleanup_at?: string | null
          metadata?: Json | null
          test_batch_id?: string | null
        }
      }
      teams: {
        Row: {
          id: string
          name: string
          created_at: string
          updated_at: string
          tags: string[]
        }
        Insert: Omit<Tables['teams']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Tables['teams']['Insert']>
      }
      team_members: {
        Row: {
          team_id: string
          user_id: string
        }
        Insert: Tables['team_members']['Row']
        Update: Partial<Tables['team_members']['Row']>
      }
      tickets: {
        Row: {
          id: string
          title: string
          description: string
          status: string
          priority: string
          customer_id: string
          assigned_to_id: string | null
          created_by_id: string
          tags: string[]
          created_at: string
          updated_at: string
          cleanup_at: string | null
          test_batch_id: string | null
          metadata: Json | null
          description_html: string
          last_updated_by_id: string | null
        }
        Insert: Omit<Tables['tickets']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Tables['tickets']['Insert']>
      }
      messages: {
        Row: {
          id: string
          content: string
          ticket_id: string
          is_internal: boolean
          created_at: string
          updated_at: string
          content_html: string
        }
        Insert: Omit<Tables['messages']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Tables['messages']['Insert']>
      }
      audit_logs: {
        Row: {
          id: string
          action: string
          entity: string
          entity_id: string
          user_id: string
          old_data: Json | null
          new_data: Json
          timestamp: string
        }
        Insert: Omit<Tables['audit_logs']['Row'], 'id' | 'timestamp'>
        Update: Partial<Tables['audit_logs']['Insert']>
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_clade: 'ADMIN' | 'MANAGER' | 'AGENT' | 'CUSTOMER'
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]

export enum UserClade {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  AGENT = 'AGENT',
  CUSTOMER = 'CUSTOMER',
}
