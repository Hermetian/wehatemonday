import { z } from "zod";
import { router, protectedProcedure } from "../trpc";

export const userRouter = router({
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

      return await ctx.prisma.user.update({
        where: { id: userId },
        data: {
          ...(name && { name }),
          ...(email && { email }),
          updatedAt: new Date(),
        },
      });
    }),
}); 