// Local-only deployment: no external auth providers. Convex still exposes
// ctx.auth.getUserIdentity() but nothing calls it — see convex/auth.ts,
// which returns a hardcoded identity instead.
export default {
  providers: [],
};
