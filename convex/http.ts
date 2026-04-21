import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

http.route({
  path: "/lawn/media/complete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = request.headers.get("x-lawn-callback-secret");
    if (secret !== requireEnv("LAWN_MEDIA_CALLBACK_SECRET")) {
      return new Response("unauthorized", { status: 401 });
    }

    let payload: {
      videoId?: string;
      duration?: number;
      fileSize?: number;
      hlsUrl?: string;
      thumbnailUrl?: string;
    };
    try {
      payload = await request.json();
    } catch {
      return new Response("invalid json", { status: 400 });
    }

    const { videoId, duration, hlsUrl, thumbnailUrl } = payload;
    if (!videoId || !hlsUrl || !thumbnailUrl) {
      return new Response("missing fields", { status: 400 });
    }

    const baseUrl = (process.env.LAWN_MEDIA_BASE_URL ?? "").replace(/\/$/, "");
    const thumbnailAbs = thumbnailUrl.startsWith("http")
      ? thumbnailUrl
      : `${baseUrl}${thumbnailUrl}`;

    await ctx.runMutation(internal.videos.markAsReady, {
      videoId: videoId as never,
      muxAssetId: videoId,
      muxPlaybackId: videoId,
      duration: typeof duration === "number" ? duration : undefined,
      thumbnailUrl: thumbnailAbs,
    });

    return new Response("ok", { status: 200 });
  }),
});

http.route({
  path: "/lawn/media/failed",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = request.headers.get("x-lawn-callback-secret");
    if (secret !== requireEnv("LAWN_MEDIA_CALLBACK_SECRET")) {
      return new Response("unauthorized", { status: 401 });
    }

    let payload: { videoId?: string; error?: string };
    try {
      payload = await request.json();
    } catch {
      return new Response("invalid json", { status: 400 });
    }

    const { videoId, error } = payload;
    if (!videoId) {
      return new Response("missing videoId", { status: 400 });
    }

    await ctx.runMutation(internal.videos.markAsFailed, {
      videoId: videoId as never,
      uploadError: error ?? "transcode failed",
    });

    return new Response("ok", { status: 200 });
  }),
});

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => new Response("OK", { status: 200 })),
});

export default http;
