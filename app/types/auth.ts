// Valid role values - must match database enum
export const VALID_ROLES = ['ADMIN', 'MANAGER', 'AGENT', 'CUSTOMER'] as const;

// Type for the role values themselves
export type Role = typeof VALID_ROLES[number];

// Type alias for the database enum
export type DbRole = Role;  // Maps to user_role_enum in PostgreSQL

// Type alias for the JWT metadata field (stored as string)
export type JwtRole = Role;  // Stored as uppercase string in JWT

// Legacy Prisma UserRole type alias for compatibility during migration
export type UserRole = Role;

// Export an enum-like object for use in place of Prisma's UserRole
export const UserRole = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  AGENT: 'AGENT',
  CUSTOMER: 'CUSTOMER'
} as const;

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

// Deprecated - will be removed
export type user_role = Role;  // For backwards compatibility