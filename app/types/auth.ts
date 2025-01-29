// Valid role values - must match database enum
export const VALID_ROLES = ['ADMIN', 'MANAGER', 'AGENT', 'CUSTOMER'] as const;

// Type for the role values themselves
export type Role = typeof VALID_ROLES[number];

// Type alias for the database enum
export type DbRole = Role;  // Maps to user_role_enum in PostgreSQL

// Type alias for the JWT metadata field (stored as string)
export type JwtRole = Role;  // Stored as uppercase string in JWT

// Database user type
export interface DbUser {
  id: string;
  email: string;
  role: DbRole;  // PostgreSQL enum type user_role_enum
  created_at: string;
  updated_at: string;
  cleanup_at?: string;
  metadata?: Record<string, unknown>;
  test_batch_id?: string;
}

// JWT metadata type
export interface AuthMetadata {
  user_role: JwtRole;  // Stored as uppercase string
  [key: string]: unknown;
}