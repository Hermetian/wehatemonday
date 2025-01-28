import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { createAuditLog } from "@/app/lib/utils/audit-logger";
import { TRPCError } from "@trpc/server";

export const userRouter = router({
  getProfile: publicProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user) {
        return {
          name: null,
          email: null,
          role: null
        };
      }

      try {
        const { data: user, error } = await ctx.supabase
          .from('users')
          .select('name, email, role')
          .eq('id', ctx.user.id)
          .single();

        if (error) {
          console.error('Error fetching user profile:', error);
          return {
            name: null,
            email: null,
            role: null
          };
        }

        return user || {
          name: null,
          email: null,
          role: null
        };
      } catch (error) {
        console.error('Error in getProfile:', error);
        return {
          name: null,
          email: null,
          role: null
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
    .input(
      z.object({
        role: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const userId = ctx.user.id;

        // Get existing user data for audit log
        const { data: existingUser, error: fetchError } = await ctx.supabase
          .from('users')
          .select('role')
          .eq('id', userId)
          .single();

        if (fetchError || !existingUser) {
          throw new Error("User not found");
        }

        // Update user role
        const { data: updatedUser, error: updateError } = await ctx.supabase
          .from('users')
          .update({
            role: input.role,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId)
          .select()
          .single();

        if (updateError || !updatedUser) {
          throw new Error("Failed to update user role");
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