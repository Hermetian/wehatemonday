import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { createAuditLog } from "@/app/lib/utils/audit-logger";
import { UserRole } from "@prisma/client";

export const userRouter = router({
  getProfile: protectedProcedure
    .query(async ({ ctx }) => {
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
        throw new Error("User not found");
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
}); 