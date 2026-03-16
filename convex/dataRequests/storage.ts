import { mutation } from "../_generated/server";
import { v } from "convex/values";

export const generateUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // Validate the token belongs to a pending request
    const request = await ctx.db
      .query("dataRequests")
      .withIndex("by_token", (q: any) => q.eq("token", args.token))
      .first();

    if (!request) throw new Error("Invalid form link");
    // Only block expired forms — completed forms can always be updated
    if (request.status === "expired") throw new Error("Form link has expired");
    if (request.status === "pending" && request.expiresAt < Date.now()) {
      throw new Error("Form link has expired");
    }

    return await ctx.storage.generateUploadUrl();
  },
});
