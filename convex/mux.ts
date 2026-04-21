"use node";

import { createHmac } from "node:crypto";

// Local replacement for the Mux SDK surface. Naming is preserved so the
// rest of the Convex codebase compiles unchanged — the "muxPlaybackId"
// schema column simply holds the lawn videoId in local mode. All URLs
// resolve to the lawn.ww Caddy instance, which serves HLS/thumbs from
// the shared volume and proxies uploads/source fetches to lawn-media.

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function getBaseUrl(): string {
  return requireEnv("LAWN_MEDIA_BASE_URL").replace(/\/$/, "");
}

export function getUploadSecret(): string {
  return requireEnv("LAWN_MEDIA_UPLOAD_SECRET");
}

export function signVideoToken(videoId: string): string {
  return createHmac("sha256", getUploadSecret())
    .update(videoId)
    .digest("hex");
}

export function buildUploadUrl(videoId: string, filename: string): string {
  const url = new URL(`${getBaseUrl()}/media/upload/${videoId}`);
  url.searchParams.set("token", signVideoToken(videoId));
  url.searchParams.set("filename", filename);
  return url.toString();
}

export function buildSourceUrl(videoId: string): string {
  const url = new URL(`${getBaseUrl()}/media/source/${videoId}`);
  url.searchParams.set("token", signVideoToken(videoId));
  return url.toString();
}

export function buildMuxPlaybackUrl(playbackId: string, _token?: string): string {
  return `${getBaseUrl()}/hls/${playbackId}/master.m3u8`;
}

export function buildMuxThumbnailUrl(playbackId: string, _token?: string): string {
  return `${getBaseUrl()}/thumbnails/${playbackId}.jpg`;
}

// The following shims preserve the upstream API surface so callers don't
// need to branch on cloud vs. local. In local mode every "asset" is just
// the videoId — uploads kick off transcoding via lawn-media as soon as
// the source bytes land.

type FakePlaybackId = { id: string; policy: string };

type FakeAsset = {
  id: string;
  passthrough?: string;
  duration?: number;
  playback_ids: FakePlaybackId[];
};

export async function createMuxAssetFromInputUrl(
  videoId: string,
  _inputUrl: string,
): Promise<FakeAsset> {
  // lawn-media starts transcoding as soon as /media/upload finishes —
  // there is nothing to do here. Return a fake "asset" keyed on videoId
  // so the caller can persist muxAssetId = videoId.
  return {
    id: videoId,
    passthrough: videoId,
    playback_ids: [{ id: videoId, policy: "public" }],
  };
}

export async function getMuxAsset(assetId: string): Promise<FakeAsset> {
  return {
    id: assetId,
    passthrough: assetId,
    playback_ids: [{ id: assetId, policy: "public" }],
  };
}

export async function deleteMuxAsset(_assetId: string): Promise<void> {
  // No-op in local mode. Cleanup of source/HLS/thumbnails is handled by
  // the future GC path (not yet wired).
}

export async function createSignedPlaybackId(
  assetId: string,
): Promise<FakePlaybackId> {
  return { id: assetId, policy: "signed" };
}

export async function createPublicPlaybackId(
  assetId: string,
): Promise<FakePlaybackId> {
  return { id: assetId, policy: "public" };
}

export async function deletePlaybackId(
  _assetId: string,
  _playbackId: string,
): Promise<void> {
  // No-op.
}

export async function signPlaybackToken(
  _playbackId: string,
  _expiration = "1h",
): Promise<string | null> {
  // Local mode has no signed playback.
  return null;
}

export async function signThumbnailToken(
  _playbackId: string,
  _expiration = "1h",
): Promise<string | null> {
  return null;
}

export function verifyMuxWebhookSignature(
  _rawBody: string,
  _signature: string | null,
) {
  // Only reachable via the back-compat /webhooks/mux shim. In local mode
  // there is no Mux, so the call is effectively a no-op — signature check
  // is skipped because there is no secret to check against.
}
