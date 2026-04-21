"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";

// Kept as a no-op so convex/http.ts's back-compat /webhooks/mux route
// compiles. lawn-media pushes completion through /lawn/media/complete
// (see convex/http.ts) instead of webhooks.
export const processWebhook = internalAction({
  args: {
    rawBody: v.string(),
    signature: v.optional(v.string()),
  },
  returns: v.object({
    status: v.number(),
    message: v.string(),
  }),
  handler: async () => {
    return { status: 200, message: "no-op (local mode)" };
  },
});
