// Local-only auth shim. Replaces @clerk/tanstack-react-start for the
// self-hosted deployment where there is exactly one user and no sign-in.
//
// Every export below matches the Clerk API surface we actually use. If a
// new Clerk symbol is imported elsewhere, add it here rather than gating
// the call site on local-vs-cloud.

import type { ReactNode } from "react";

export const LOCAL_USER_ID = "local";
export const LOCAL_USER_EMAIL = "local@lawn.ww";
export const LOCAL_USER_NAME = "Local";

const LOCAL_USER = {
  id: LOCAL_USER_ID,
  fullName: LOCAL_USER_NAME,
  firstName: LOCAL_USER_NAME,
  lastName: "",
  username: LOCAL_USER_ID,
  imageUrl: "",
  primaryEmailAddress: { emailAddress: LOCAL_USER_EMAIL },
  emailAddresses: [{ emailAddress: LOCAL_USER_EMAIL }],
};

export function useAuth() {
  return {
    isLoaded: true,
    isSignedIn: true,
    userId: LOCAL_USER_ID,
    sessionId: "local-session",
    orgId: null,
    orgRole: null,
    orgSlug: null,
    signOut: async () => {},
    getToken: async () => null,
    has: () => true,
  };
}

export function useUser() {
  return {
    isLoaded: true,
    isSignedIn: true,
    user: LOCAL_USER,
  };
}

export function ClerkProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function SignedIn({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function SignedOut(_: { children: ReactNode }) {
  return null;
}

export function SignIn(_props: Record<string, unknown> = {}) {
  return (
    <div className="p-8 text-center text-[#888]">
      Local mode — sign-in disabled.
    </div>
  );
}

export function SignUp(_props: Record<string, unknown> = {}) {
  return (
    <div className="p-8 text-center text-[#888]">
      Local mode — sign-up disabled.
    </div>
  );
}

export function UserButton(_props: Record<string, unknown> = {}) {
  return (
    <div
      className="w-8 h-8 flex items-center justify-center border-2 border-[#1a1a1a] bg-[#2d5a2d] text-[#f0f0e8] font-mono text-xs font-bold"
      title={`Signed in as ${LOCAL_USER_NAME} (local mode)`}
    >
      L
    </div>
  );
}
