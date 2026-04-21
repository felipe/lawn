"use node";

import { v } from "convex/values";
import { action, ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  buildMuxPlaybackUrl,
  buildMuxThumbnailUrl,
  buildSourceUrl,
  buildUploadUrl,
} from "./mux";

const GIBIBYTE = 1024 ** 3;
const MAX_UPLOAD_FILE_SIZE_BYTES = 10 * GIBIBYTE;
const ALLOWED_UPLOAD_CONTENT_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
]);

function sanitizeFilename(input: string) {
  const trimmed = input.trim();
  const base = trimmed.length > 0 ? trimmed : "video";
  return base
    .replace(/["']/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function normalizeContentType(contentType: string | null | undefined): string {
  if (!contentType) return "";
  return contentType.split(";")[0].trim().toLowerCase();
}

function isAllowedUploadContentType(contentType: string): boolean {
  return ALLOWED_UPLOAD_CONTENT_TYPES.has(contentType);
}

function validateUploadRequestOrThrow(args: {
  fileSize: number;
  contentType: string;
}): string {
  if (!Number.isFinite(args.fileSize) || args.fileSize <= 0) {
    throw new Error("Video file size must be greater than zero.");
  }
  if (args.fileSize > MAX_UPLOAD_FILE_SIZE_BYTES) {
    throw new Error("Video file is too large for direct upload.");
  }
  const normalizedContentType = normalizeContentType(args.contentType);
  if (!isAllowedUploadContentType(normalizedContentType)) {
    throw new Error("Unsupported video format. Allowed: mp4, mov, webm, mkv.");
  }
  return normalizedContentType;
}

async function requireVideoMemberAccess(
  ctx: ActionCtx,
  videoId: Id<"videos">,
) {
  const video = (await ctx.runQuery(api.videos.get, { videoId })) as
    | { role?: string }
    | null;
  if (!video || video.role === "viewer") {
    throw new Error("Requires member role or higher");
  }
}

function buildPlaybackSession(
  playbackId: string,
): { url: string; posterUrl: string } {
  return {
    url: buildMuxPlaybackUrl(playbackId),
    posterUrl: buildMuxThumbnailUrl(playbackId),
  };
}

function buildDownloadFilename(title: string | undefined): string {
  const base = sanitizeFilename(title ?? "video");
  return base.endsWith(".mp4") ? base : `${base}.mp4`;
}

export const getUploadUrl = action({
  args: {
    videoId: v.id("videos"),
    filename: v.string(),
    fileSize: v.number(),
    contentType: v.string(),
  },
  returns: v.object({
    url: v.string(),
    uploadId: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireVideoMemberAccess(ctx, args.videoId);
    const normalizedContentType = validateUploadRequestOrThrow({
      fileSize: args.fileSize,
      contentType: args.contentType,
    });

    const sanitizedFilename = sanitizeFilename(args.filename);
    const url = buildUploadUrl(args.videoId, sanitizedFilename);

    await ctx.runMutation(internal.videos.setUploadInfo, {
      videoId: args.videoId,
      s3Key: `sources/${args.videoId}`,
      fileSize: args.fileSize,
      contentType: normalizedContentType,
    });

    return { url, uploadId: args.videoId };
  },
});

export const markUploadComplete = action({
  args: {
    videoId: v.id("videos"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireVideoMemberAccess(ctx, args.videoId);

    // lawn-media picks up the file as soon as the PUT finishes and begins
    // transcoding. All we need to do here is flip the status so the UI
    // shows "processing" until /lawn/media/complete lands.
    await ctx.runMutation(internal.videos.markAsProcessing, {
      videoId: args.videoId,
    });
    await ctx.runMutation(internal.videos.setMuxAssetReference, {
      videoId: args.videoId,
      muxAssetId: args.videoId,
    });

    return { success: true };
  },
});

export const markUploadFailed = action({
  args: {
    videoId: v.id("videos"),
  },
  returns: v.object({
    success: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireVideoMemberAccess(ctx, args.videoId);
    await ctx.runMutation(internal.videos.markAsFailed, {
      videoId: args.videoId,
      uploadError: "Upload failed before transcoding could start.",
    });
    return { success: true };
  },
});

export const getPlaybackSession = action({
  args: { videoId: v.id("videos") },
  returns: v.object({
    url: v.string(),
    posterUrl: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ url: string; posterUrl: string }> => {
    const video = await ctx.runQuery(api.videos.getVideoForPlayback, {
      videoId: args.videoId,
    });
    if (!video || !video.muxPlaybackId || video.status !== "ready") {
      throw new Error("Video not found or not ready");
    }
    return buildPlaybackSession(video.muxPlaybackId);
  },
});

export const getPlaybackUrl = action({
  args: { videoId: v.id("videos") },
  returns: v.object({
    url: v.string(),
  }),
  handler: async (ctx, args): Promise<{ url: string }> => {
    const video = await ctx.runQuery(api.videos.getVideoForPlayback, {
      videoId: args.videoId,
    });
    if (!video || !video.muxPlaybackId || video.status !== "ready") {
      throw new Error("Video not found or not ready");
    }
    return { url: buildMuxPlaybackUrl(video.muxPlaybackId) };
  },
});

export const getOriginalPlaybackUrl = action({
  args: { videoId: v.id("videos") },
  returns: v.object({
    url: v.string(),
    contentType: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ url: string; contentType: string }> => {
    const video = await ctx.runQuery(api.videos.getVideoForPlayback, {
      videoId: args.videoId,
    });
    if (!video) {
      throw new Error("Original file not found for this video");
    }
    return {
      url: buildSourceUrl(args.videoId),
      contentType: video.contentType ?? "video/mp4",
    };
  },
});

export const getPublicPlaybackSession = action({
  args: { publicId: v.string() },
  returns: v.object({
    url: v.string(),
    posterUrl: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ url: string; posterUrl: string }> => {
    const result = await ctx.runQuery(api.videos.getByPublicId, {
      publicId: args.publicId,
    });
    if (!result?.video?.muxPlaybackId) {
      throw new Error("Video not found or not ready");
    }
    return buildPlaybackSession(result.video.muxPlaybackId);
  },
});

export const getSharedPlaybackSession = action({
  args: { grantToken: v.string() },
  returns: v.object({
    url: v.string(),
    posterUrl: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ url: string; posterUrl: string }> => {
    const result = await ctx.runQuery(api.videos.getByShareGrant, {
      grantToken: args.grantToken,
    });
    if (!result?.video?.muxPlaybackId) {
      throw new Error("Video not found or not ready");
    }
    return buildPlaybackSession(result.video.muxPlaybackId);
  },
});

export const getDownloadUrl = action({
  args: { videoId: v.id("videos") },
  returns: v.object({
    url: v.string(),
    filename: v.string(),
  }),
  handler: async (ctx, args): Promise<{ url: string; filename: string }> => {
    const video = await ctx.runQuery(api.videos.getVideoForPlayback, {
      videoId: args.videoId,
    });
    if (!video) {
      throw new Error("Video not found");
    }
    return {
      url: buildSourceUrl(args.videoId),
      filename: buildDownloadFilename(video.title),
    };
  },
});

export const getPublicDownloadUrl = action({
  args: { publicId: v.string() },
  returns: v.object({
    url: v.string(),
    filename: v.string(),
  }),
  handler: async (ctx, args): Promise<{ url: string; filename: string }> => {
    const result = await ctx.runQuery(api.videos.getByPublicIdForDownload, {
      publicId: args.publicId,
    });
    if (!result?.video) {
      throw new Error("Video not found");
    }
    return {
      url: buildSourceUrl(result.video._id),
      filename: buildDownloadFilename(result.video.title),
    };
  },
});

export const getSharedDownloadUrl = action({
  args: { grantToken: v.string() },
  returns: v.object({
    url: v.string(),
    filename: v.string(),
  }),
  handler: async (ctx, args): Promise<{ url: string; filename: string }> => {
    const result = await ctx.runQuery(api.videos.getByShareGrantForDownload, {
      grantToken: args.grantToken,
    });
    if (!result?.video) {
      throw new Error("Video not found");
    }
    if (!result.allowDownload) {
      throw new Error("Downloads are disabled for this shared link.");
    }
    return {
      url: buildSourceUrl(result.video._id),
      filename: buildDownloadFilename(result.video.title),
    };
  },
});
