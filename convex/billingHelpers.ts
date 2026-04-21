import { Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

// Local-only stubs. Upstream lawn gates storage + project creation on a
// Stripe subscription; the self-hosted deployment has no billing surface,
// so every team resolves to an "unlimited pro" state and every gate is
// a no-op. Call sites kept their shape to minimise diff.

export type TeamPlan = "basic" | "pro";

const GIBIBYTE = 1024 ** 3;

export const TEAM_PLAN_MONTHLY_PRICE_USD: Record<TeamPlan, number> = {
  basic: 0,
  pro: 0,
};

const UNLIMITED_STORAGE_BYTES = 1024 * 1024 * GIBIBYTE;

export const TEAM_PLAN_STORAGE_LIMIT_BYTES: Record<TeamPlan, number> = {
  basic: UNLIMITED_STORAGE_BYTES,
  pro: UNLIMITED_STORAGE_BYTES,
};

export function normalizeStoredTeamPlan(_plan: string): TeamPlan {
  return "pro";
}

export function resolvePlanFromStripePriceId(
  _stripePriceId: string | undefined | null,
): TeamPlan | null {
  return null;
}

export function getStripePriceIdForPlan(_plan: TeamPlan): string {
  throw new Error("Billing is disabled in local mode.");
}

export function hasActiveTeamSubscriptionStatus(
  _status: string | undefined | null,
): boolean {
  return true;
}

type BillingCtx = QueryCtx | MutationCtx;

type FakeSubscription = {
  status: "active";
  priceId: null;
  stripeCustomerId: null;
  stripeSubscriptionId: null;
  currentPeriodEnd: null;
};

const FAKE_SUBSCRIPTION: FakeSubscription = {
  status: "active",
  priceId: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  currentPeriodEnd: null,
};

export async function getTeamSubscriptionByOrgId(
  _ctx: BillingCtx,
  _teamId: Id<"teams">,
) {
  return FAKE_SUBSCRIPTION;
}

export async function getTeamSubscriptionState(
  ctx: BillingCtx,
  teamId: Id<"teams">,
) {
  const team = await ctx.db.get(teamId);
  if (!team) {
    throw new Error("Team not found");
  }

  return {
    team,
    subscription: FAKE_SUBSCRIPTION,
    plan: "pro" as TeamPlan,
    hasActiveSubscription: true,
  };
}

export async function getTeamStorageUsedBytes(
  ctx: BillingCtx,
  teamId: Id<"teams">,
) {
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_team", (q) => q.eq("teamId", teamId))
    .collect();

  const videosByProject = await Promise.all(
    projects.map((project) =>
      ctx.db
        .query("videos")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect(),
    ),
  );

  let total = 0;
  for (const videos of videosByProject) {
    for (const video of videos) {
      if (video.status === "failed") continue;
      if (typeof video.fileSize === "number" && Number.isFinite(video.fileSize)) {
        total += video.fileSize;
      }
    }
  }

  return total;
}

export async function assertTeamHasActiveSubscription(
  ctx: BillingCtx,
  teamId: Id<"teams">,
) {
  return await getTeamSubscriptionState(ctx, teamId);
}

export async function assertTeamCanStoreBytes(
  ctx: BillingCtx,
  teamId: Id<"teams">,
  _incomingBytes: number,
) {
  const state = await getTeamSubscriptionState(ctx, teamId);
  const storageUsedBytes = await getTeamStorageUsedBytes(ctx, teamId);
  return {
    ...state,
    storageUsedBytes,
    storageLimitBytes: UNLIMITED_STORAGE_BYTES,
  };
}
