export enum UserClade {
  CUSTOMER = 'CUSTOMER',
  AGENT = 'AGENT',
  ADMIN = 'ADMIN'
}

export interface User {
  id: string;
  email: string;
  name: string;
  clade: UserClade;
  metadata: {
    isTest?: boolean;
    batchId?: string;
    flags?: string[];
  };
  testBatchId?: string;
  cleanupAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: User;
        Insert: Omit<User, 'id' | 'createdAt' | 'updatedAt'>;
        Update: Partial<Omit<User, 'id'>>;
      };
      tickets: {
        Row: {
          id: string;
          title: string;
          description: string;
          status: string;
          priority: string;
          customerId: string;
          assignedToId: string | null;
          createdAt: Date;
          updatedAt: Date;
          tags: string[];
          metadata: {
            isTest?: boolean;
            batchId?: string;
            originatingClade?: UserClade;
            assignedClade?: UserClade;
          };
          test_batch_id?: string;
          cleanup_at?: Date;
        };
        Insert: Omit<Database['public']['Tables']['tickets']['Row'], 'id' | 'createdAt' | 'updatedAt'>;
        Update: Partial<Omit<Database['public']['Tables']['tickets']['Row'], 'id'>>;
      };
    };
  };
}
