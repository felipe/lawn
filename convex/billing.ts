import { v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import { requireTeamAccess } from "./auth";
import {
  getTeamStorageUsedBytes,
  TEAM_PLAN_MONTHLY_PRICE_USD,
  TEAM_PLAN_STORAGE_LIMIT_BYTES,
  type TeamPlan,
} from "./billingHelpers";

// Local-only stubs. Same public surface the upstream Stripe-backed module
// exposed — callers in app/routes/dashboard still import these queries and
// actions — but every mutating action throws, and getTeamBilling returns a
// synthetic "unlimited pro, free forever" state.

const teamPlanValidator = v.union(v.literal("basic"), v.literal("pro"));
const teamRoleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
  v.literal("viewer"),
);

export const createSubscriptionCheckout = action({
  args: {
    teamId: v.id("teams"),
    plan: teamPlanValidator,
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  returns: v.object({
    sessionId: v.string(),
    url: v.union(v.string(), v.null()),
  }),
  handler: async (): Promise<{ sessionId: string; url: string | null }> => {
    throw new Error("Billing is disabled in local mode.");
  },
});

export const createCustomerPortalSession = action({
  args: {
    teamId: v.id("teams"),
    returnUrl: v.string(),
  },
  returns: v.object({
    url: v.string(),
  }),
  handler: async (): Promise<{ url: string }> => {
    throw new Error("Billing is disabled in local mode.");
  },
});

export const updateTeamSubscriptionPlan = action({
  args: {
    teamId: v.id("teams"),
    plan: teamPlanValidator,
  },
  returns: v.object({
    plan: teamPlanValidator,
    subscriptionStatus: v.string(),
  }),
  handler: async (): Promise<{ plan: TeamPlan; subscriptionStatus: string }> => {
    throw new Error("Billing is disabled in local mode.");
  },
});

export const getTeamBilling = query({
  args: {
    teamId: v.id("teams"),
  },
  returns: v.object({
    plan: teamPlanValidator,
    monthlyPriceUsd: v.number(),
    storageLimitBytes: v.number(),
    storageUsedBytes: v.number(),
    hasActiveSubscription: v.boolean(),
    subscriptionStatus: v.union(v.string(), v.null()),
    stripeCustomerId: v.union(v.string(), v.null()),
    stripeSubscriptionId: v.union(v.string(), v.null()),
    stripePriceId: v.union(v.string(), v.null()),
    currentPeriodEnd: v.union(v.number(), v.null()),
    role: teamRoleValidator,
    canManageBilling: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { membership } = await requireTeamAccess(ctx, args.teamId);
    const storageUsedBytes = await getTeamStorageUsedBytes(ctx, args.teamId);

    return {
      plan: "pro" as const,
      monthlyPriceUsd: TEAM_PLAN_MONTHLY_PRICE_USD.pro,
      storageLimitBytes: TEAM_PLAN_STORAGE_LIMIT_BYTES.pro,
      storageUsedBytes,
      hasActiveSubscription: true,
      subscriptionStatus: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodEnd: null,
      role: membership.role,
      canManageBilling: membership.role === "owner",
    };
  },
});

export const syncTeamSubscriptionFromWebhook = internalMutation({
  args: {
    orgId: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.string(),
    stripePriceId: v.optional(v.string()),
    status: v.string(),
  },
  returns: v.null(),
  handler: async () => {
    return null;
  },
});
