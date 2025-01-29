import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { createAuditLog } from "@/app/lib/utils/audit-logger";
import { TRPCError } from "@trpc/server";
import { VALID_ROLES } from '@/app/types/auth';
import { createAdminClient } from '@/app/lib/auth/supabase';

export const userRouter = router({
  getProfile: publicProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user) {
        return {
          id: null,
          name: null,
          email: null,
          role: null,
          created_at: null,
          updated_at: null,
          cleanup_at: null,
          metadata: null,
          test_batch_id: null
        };
      }

      try {
        const { data: user, error } = await ctx.supabase
          .from('users')
          .select('id, name, email, role, created_at, updated_at, cleanup_at, metadata, test_batch_id')
          .eq('id', ctx.user.id)
          .single();

        if (error) {
          console.error('Error fetching user profile:', error);
          return {
            id: null,
            name: null,
            email: null,
            role: null,
            created_at: null,
            updated_at: null,
            cleanup_at: null,
            metadata: null,
            test_batch_id: null
          };
        }

        return user || {
          id: null,
          name: null,
          email: null,
          role: null,
          created_at: null,
          updated_at: null,
          cleanup_at: null,
          metadata: null,
          test_batch_id: null
        };
      } catch (error) {
        console.error('Error in getProfile:', error);
        return {
          id: null,
          name: null,
          email: null,
          role: null,
          created_at: null,
          updated_at: null,
          cleanup_at: null,
          metadata: null,
          test_batch_id: null
        };
      }
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const { name, email } = input;
        const userId = ctx.user.id;

        // Get existing user data for audit log
        const { data: existingUser, error: fetchError } = await ctx.supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();

        if (fetchError || !existingUser) {
          throw new Error("User not found");
        }

        // Update user data
        const { data: updatedUser, error: updateError } = await ctx.supabase
          .from('users')
          .update({
            ...(name && { name }),
            ...(email && { email }),
            updated_at: new Date().toISOString()
          })
          .eq('id', userId)
          .select()
          .single();

        if (updateError || !updatedUser) {
          throw new Error("Failed to update user");
        }

        // Create audit log
        await createAuditLog({
          action: 'UPDATE',
          entity: 'USER',
          entityId: userId,
          userId: ctx.user.id,
          oldData: existingUser,
          newData: updatedUser,
          supabase: ctx.supabase
        });

        return updatedUser;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update profile',
          cause: error,
        });
      }
    }),

  updateRole: protectedProcedure
    .input(z.object({
      user_id: z.string(),
      new_role: z.enum(VALID_ROLES),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        // Only admins can update roles
        if (ctx.user.role !== 'ADMIN') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only administrators can update user roles',
          });
        }

        // Get current user data for audit log
        const { data: currentUser, error: fetchError } = await ctx.supabase
          .from('users')
          .select('role')
          .eq('id', input.user_id)
          .single();

        if (fetchError || !currentUser) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        // Update user role in the database
        const { data: updatedUser, error: updateError } = await ctx.supabase
          .from('users')
          .update({ role: input.new_role })
          .eq('id', input.user_id)
          .select()
          .single();

        if (updateError || !updatedUser) {
          console.error('Error updating user role:', updateError);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update user role in database',
          });
        }

        // Update user role in auth metadata using admin client
        const adminClient = createAdminClient();
        const { error: authError } = await adminClient.auth.admin.updateUserById(
          input.user_id,
          {
            app_metadata: {
              user_role: input.new_role
            }
          }
        );

        if (authError) {
          console.error('Error updating auth metadata:', authError);
          // Revert database change if auth update fails
          await ctx.supabase
            .from('users')
            .update({ role: currentUser.role })
            .eq('id', input.user_id);

          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update user role in auth metadata',
          });
        }

        // Create audit log
        await createAuditLog({
          action: 'UPDATE',
          entity: 'USER',
          entityId: input.user_id,
          userId: ctx.user.id,
          oldData: { role: currentUser.role },
          newData: { role: input.new_role },
          supabase: ctx.supabase
        });

        return updatedUser;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error('Unexpected error in updateRole:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update user role',
          cause: error,
        });
      }
    }),

  listByRole: protectedProcedure
    .input(z.object({
      role: z.string(),
      searchQuery: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        if (ctx.user?.role !== 'MANAGER' && ctx.user?.role !== 'ADMIN') {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only managers and admins can list users by role",
          });
        }

        let query = ctx.supabase
          .from('users')
          .select('id, name, email, role, created_at, updated_at, cleanup_at, metadata, test_batch_id')
          .eq('role', input.role)
          .order('name', { ascending: true });

        // Add search filter if provided
        if (input.searchQuery) {
          query = query.or(`name.ilike.%${input.searchQuery}%,email.ilike.%${input.searchQuery}%`);
        }

        const { data: users, error } = await query;

        if (error) {
          throw new Error("Failed to fetch users");
        }

        return users?.map(user => ({
          ...user,
          created_at: user.created_at,
          updated_at: user.updated_at,
          cleanup_at: user.cleanup_at,
        })) || [];
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list users',
          cause: error,
        });
      }
    }),
}); 