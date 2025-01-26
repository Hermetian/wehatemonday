import { router, protectedProcedure } from '@/app/lib/trpc/trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { UserClade } from '@/lib/supabase/types';

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  clade: UserClade;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export const userRouter = router({
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      clade: z.nativeEnum(UserClade).optional(),
      excludeIds: z.array(z.string()).optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        let query = ctx.supabase
          .from('users')
          .select('*')
          .order('name');

        if (input.search) {
          query = query.or(`name.ilike.%${input.search}%,email.ilike.%${input.search}%`);
        }

        if (input.clade) {
          query = query.eq('clade', input.clade);
        }

        if (input.excludeIds?.length) {
          query = query.not('id', 'in', input.excludeIds);
        }

        const { data: users, error } = await query;

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch users',
          });
        }

        return users;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        });
      }
    }),

  get: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { data: user, error } = await ctx.supabase
          .from('users')
          .select('*')
          .eq('id', input.id)
          .single();

        if (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to fetch user',
          });
        }

        return user;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        });
      }
    }),

  getProfile: protectedProcedure
    .query(async ({ ctx }) => {
      const { data, error } = await ctx.supabase
        .from('users')
        .select('*')
        .eq('id', ctx.user.id)
        .single();

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message,
        });
      }

      return data as UserProfile;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        email: z.string().email().optional(),
        clade: z.nativeEnum(UserClade).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Only admins can change user clade
        if (input.clade && ctx.user.clade !== UserClade.ADMIN) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only admins can change user clades',
          });
        }

        // Get existing user data for audit log
        const { data: existingUser, error: fetchError } = await ctx.supabase
          .from('users')
          .select('*')
          .eq('id', input.id)
          .single();

        if (fetchError || !existingUser) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        // Users can only update their own profile unless they're an admin
        if (input.id !== ctx.user.id && ctx.user.clade !== UserClade.ADMIN) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You can only update your own profile',
          });
        }

        const { data: user, error: updateError } = await ctx.supabase
          .from('users')
          .update({
            name: input.name,
            email: input.email,
            clade: input.clade,
            metadata: input.metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.id)
          .select()
          .single();

        if (updateError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update user',
          });
        }

        // Create audit log
        await ctx.supabase
          .from('audit_logs')
          .insert({
            action: 'UPDATE',
            entity: 'USER',
            entity_id: user.id,
            user_id: ctx.user.id,
            old_data: {
              name: existingUser.name,
              email: existingUser.email,
              clade: existingUser.clade,
              metadata: existingUser.metadata,
            },
            new_data: {
              name: user.name,
              email: user.email,
              clade: user.clade,
              metadata: user.metadata,
            },
          });

        return user as UserProfile;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        });
      }
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
        clade: z.nativeEnum(UserClade).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        currentPassword: z.string().optional(),
        newPassword: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get existing user data for audit log
      const { data: existingUser, error: fetchError } = await ctx.supabase
        .from('users')
        .select('*')
        .eq('id', ctx.user.id)
        .single();

      if (fetchError || !existingUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      const updates: any = {};
      
      if (input.name) {
        updates.name = input.name;
      }
      
      if (input.email) {
        updates.email = input.email;
      }
      
      if (input.clade) {
        // Only admins can change clades
        if (ctx.user.clade !== UserClade.ADMIN) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only admins can change clades',
          });
        }
        updates.clade = input.clade;
      }

      if (input.metadata) {
        updates.metadata = input.metadata;
      }

      let updatedUser = existingUser;

      if (Object.keys(updates).length > 0) {
        const { data: updated, error: updateError } = await ctx.supabase
          .from('users')
          .update({
            ...updates,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ctx.user.id)
          .select()
          .single();

        if (updateError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update profile',
          });
        }

        updatedUser = updated;

        // Create audit log for profile update
        await ctx.supabase
          .from('audit_logs')
          .insert({
            action: 'UPDATE',
            entity: 'USER',
            entity_id: ctx.user.id,
            user_id: ctx.user.id,
            old_data: {
              name: existingUser.name,
              email: existingUser.email,
              clade: existingUser.clade,
              metadata: existingUser.metadata,
            },
            new_data: {
              name: updatedUser.name,
              email: updatedUser.email,
              clade: updatedUser.clade,
              metadata: updatedUser.metadata,
            },
          });
      }

      if (input.newPassword) {
        if (!input.currentPassword) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Current password is required to change password',
          });
        }

        const { error: passwordError } = await ctx.supabase.auth.updateUser({
          password: input.newPassword,
        });

        if (passwordError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update password',
          });
        }

        // Create audit log for password change
        await ctx.supabase
          .from('audit_logs')
          .insert({
            action: 'UPDATE',
            entity: 'USER',
            entity_id: ctx.user.id,
            user_id: ctx.user.id,
            old_data: { password_changed: false },
            new_data: { password_changed: true },
          });
      }

      return updatedUser as UserProfile;
    }),

  delete: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        // Only admins can delete users
        if (ctx.user.clade !== UserClade.ADMIN) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only admins can delete users',
          });
        }

        // Get existing user data for audit log
        const { data: existingUser, error: fetchError } = await ctx.supabase
          .from('users')
          .select('*')
          .eq('id', input.id)
          .single();

        if (fetchError || !existingUser) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        const { error: deleteError } = await ctx.supabase
          .from('users')
          .delete()
          .eq('id', input.id);

        if (deleteError) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete user',
          });
        }

        // Create audit log
        await ctx.supabase
          .from('audit_logs')
          .insert({
            action: 'DELETE',
            entity: 'USER',
            entity_id: input.id,
            user_id: ctx.user.id,
            old_data: {
              name: existingUser.name,
              email: existingUser.email,
              clade: existingUser.clade,
              metadata: existingUser.metadata,
            },
            new_data: null,
          });

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
        });
      }
    }),

  listByClade: protectedProcedure
    .input(z.object({
      clade: z.nativeEnum(UserClade),
      searchQuery: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.clade !== UserClade.MANAGER && ctx.user.clade !== UserClade.ADMIN) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only managers and admins can list users by clade',
        });
      }

      const { data: users, error } = await ctx.supabase
        .from('users')
        .select('*')
        .eq('clade', input.clade)
        .ilike('email', `%${input.searchQuery}%`);

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list users',
        });
      }

      return users;
    }),

  updateClade: protectedProcedure
    .input(z.object({
      userId: z.string(),
      clade: z.nativeEnum(UserClade),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.clade !== UserClade.ADMIN) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only admins can update user clades',
        });
      }

      // Get existing user data for audit log
      const { data: existingUser, error: fetchError } = await ctx.supabase
        .from('users')
        .select('*')
        .eq('id', input.userId)
        .single();

      if (fetchError || !existingUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Update clade in both auth metadata and users table
      const { error: authError } = await ctx.supabase.auth.admin.updateUserById(
        input.userId,
        {
          app_metadata: {
            clade: input.clade,
          },
        }
      );

      if (authError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update user clade in auth metadata',
        });
      }

      const { data: updatedUser, error: dbError } = await ctx.supabase
        .from('users')
        .update({
          clade: input.clade,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.userId)
        .select()
        .single();

      if (dbError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update user clade in database',
        });
      }

      // Create audit log for clade update
      await ctx.supabase
        .from('audit_logs')
        .insert({
          action: 'UPDATE',
          entity: 'USER',
          entity_id: input.userId,
          user_id: ctx.user.id,
          old_data: { clade: existingUser.clade },
          new_data: { clade: updatedUser.clade },
        });

      return updatedUser as UserProfile;
    }),
});