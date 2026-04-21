import { QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Local-only auth. Every call resolves to a single fixed identity — the
// self-hosted deployment runs inside a private tailnet with no sign-in
// surface. All *ClerkId columns still exist in the schema but always hold
// LOCAL_USER_ID.

const LOCAL_USER_ID = "local";
const LOCAL_USER_EMAIL = "local@lawn.ww";
const LOCAL_USER_NAME = "Local";

type ClerkIdentity = {
  subject: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  pictureUrl?: string;
};

const LOCAL_IDENTITY: ClerkIdentity = {
  subject: LOCAL_USER_ID,
  name: LOCAL_USER_NAME,
  firstName: LOCAL_USER_NAME,
  lastName: "",
  email: LOCAL_USER_EMAIL,
};

export function identityName(identity: ClerkIdentity): string {
  if (identity.name) return identity.name;
  if (identity.firstName && identity.lastName) {
    return `${identity.firstName} ${identity.lastName}`;
  }
  if (identity.email) return identity.email;
  return LOCAL_USER_NAME;
}

export function identityEmail(identity: ClerkIdentity): string {
  return identity.email ?? LOCAL_USER_EMAIL;
}

export function identityAvatarUrl(identity: ClerkIdentity): string | undefined {
  return identity.pictureUrl;
}

export async function getUser(_ctx: QueryCtx | MutationCtx) {
  return LOCAL_IDENTITY;
}

export async function requireUser(_ctx: QueryCtx | MutationCtx) {
  return LOCAL_IDENTITY;
}

export async function getIdentity(_ctx: ActionCtx) {
  return LOCAL_IDENTITY;
}

const ROLE_HIERARCHY = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
} as const;

type Role = keyof typeof ROLE_HIERARCHY;

export async function requireTeamAccess(
  ctx: QueryCtx | MutationCtx,
  teamId: Id<"teams">,
  requiredRole?: Role,
) {
  const user = await requireUser(ctx);

  const membership = await ctx.db
    .query("teamMembers")
    .withIndex("by_team_and_user", (q) =>
      q.eq("teamId", teamId).eq("userClerkId", user.subject),
    )
    .unique();

  if (!membership) {
    throw new Error("Not a team member");
  }

  if (requiredRole && ROLE_HIERARCHY[membership.role] < ROLE_HIERARCHY[requiredRole]) {
    throw new Error(`Requires ${requiredRole} role or higher`);
  }

  return { user, membership };
}

export async function requireProjectAccess(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  requiredRole?: Role,
) {
  const user = await requireUser(ctx);

  const project = await ctx.db.get(projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  const { membership } = await requireTeamAccess(ctx, project.teamId, requiredRole);

  return { user, membership, project };
}

export async function requireVideoAccess(
  ctx: QueryCtx | MutationCtx,
  videoId: Id<"videos">,
  requiredRole?: Role,
) {
  const user = await requireUser(ctx);

  const video = await ctx.db.get(videoId);
  if (!video) {
    throw new Error("Video not found");
  }

  const { membership, project } = await requireProjectAccess(
    ctx,
    video.projectId,
    requiredRole,
  );

  return { user, membership, project, video };
}
