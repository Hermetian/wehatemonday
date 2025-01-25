import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { createAuditLog } from "@/app/lib/utils/audit-logger";
import { UserRole, Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";

export const userRouter = router({
  getProfile: publicProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user) {
        return null;
      }

      const userId = ctx.user.id;
      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: {
          name: true,
          email: true,
          role: true,
        },
      });

      if (!user) {
        return null;
      }

      return user;
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().optional(),
        email: z.string().email().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { name, email } = input;
      const userId = ctx.user.id;

      // Get existing user data for audit log
      const existingUser = await ctx.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!existingUser) {
        throw new Error("User not found");
      }

      const updatedUser = await ctx.prisma.user.update({
        where: { id: userId },
        data: {
          ...(name && { name }),
          ...(email && { email }),
          updatedAt: new Date(),
        },
      });

      // Create audit log
      await createAuditLog({
        action: 'UPDATE',
        entity: 'USER',
        entityId: userId,
        userId: ctx.user.id,
        oldData: existingUser,
        newData: updatedUser,
        prisma: ctx.prisma,
      });

      return updatedUser;
    }),

  updateRole: protectedProcedure
    .input(
      z.object({
        role: z.nativeEnum(UserRole),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Get existing user data for audit log
      const existingUser = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      if (!existingUser) {
        throw new Error("User not found");
      }

      const updatedUser = await ctx.prisma.user.update({
        where: { id: userId },
        data: {
          role: input.role,
          updatedAt: new Date(),
        },
      });

      // Create audit log
      await createAuditLog({
        action: 'UPDATE',
        entity: 'USER',
        entityId: userId,
        userId: ctx.user.id,
        oldData: existingUser,
        newData: { role: input.role },
        prisma: ctx.prisma,
      });

      return updatedUser;
    }),

  listByRole: protectedProcedure
    .input(z.object({
      role: z.nativeEnum(UserRole),
      searchQuery: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      if (ctx.user?.role !== UserRole.MANAGER && ctx.user?.role !== UserRole.ADMIN) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only managers and admins can list users by role",
        });
      }

      const where: Prisma.UserWhereInput = {
        role: input.role,
        ...(input.searchQuery
          ? {
              OR: [
                {
                  name: {
                    contains: input.searchQuery,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                {
                  email: {
                    contains: input.searchQuery,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              ],
            }
          : {}),
      };

      const users = await ctx.prisma.user.findMany({
        where,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          cleanupAt: true,
          metadata: true,
          testBatchId: true,
        },
      });

      return users.map(user => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        cleanupAt: user.cleanupAt?.toISOString() || null,
      }));
    }),
}); 