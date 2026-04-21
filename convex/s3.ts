// Legacy name kept so upstream imports still resolve. In local mode there
// is no S3 — lawn-media holds originals on disk and Caddy serves them via
// /hls/*, /thumbnails/*, and /media/source/*. The only thing anyone
// imports from here is BUCKET_NAME, which is now an unused placeholder.

export const BUCKET_NAME = "lawn-local";

export function buildPublicUrl(_key: string): string {
  throw new Error(
    "buildPublicUrl is not supported in local mode; use convex/mux buildSourceUrl instead.",
  );
}

export function getS3Client(): never {
  throw new Error(
    "S3 client is disabled in local mode; lawn-media holds originals on disk.",
  );
}
