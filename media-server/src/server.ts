// lawn-media-server — the Mux replacement.
//
// Accepts authenticated raw-body PUT uploads, transcodes to HLS via
// ffmpeg, generates a thumbnail, calls back into Convex with the result.
// Caddy on Janus serves /hls/* and /thumbnails/* directly from the
// shared data volume; this process only handles ingest + transcode +
// optional source download.

import Fastify, { type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import { spawn } from "node:child_process";
import {
  createReadStream,
  createWriteStream,
  mkdirSync,
} from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createHmac, timingSafeEqual } from "node:crypto";
import { dirname } from "node:path";

const PORT = Number(process.env.PORT ?? 3070);
const DATA_DIR = process.env.LAWN_MEDIA_DATA_DIR ?? "/data/lawn";
const UPLOAD_SECRET = requireEnv("LAWN_MEDIA_UPLOAD_SECRET");
const CALLBACK_SECRET = requireEnv("LAWN_MEDIA_CALLBACK_SECRET");
const CONVEX_SITE_URL = requireEnv("CONVEX_SITE_URL");

const SOURCES_DIR = `${DATA_DIR}/sources`;
const HLS_DIR = `${DATA_DIR}/hls`;
const THUMBS_DIR = `${DATA_DIR}/thumbnails`;

for (const dir of [SOURCES_DIR, HLS_DIR, THUMBS_DIR]) {
  mkdirSync(dir, { recursive: true });
}

const app = Fastify({
  logger: true,
  bodyLimit: 10 * 1024 * 1024 * 1024,
});

// Disable body parsing for the upload route so the raw stream reaches the
// handler untouched.
app.addContentTypeParser("*", (_req, _payload, done) => done(null));

// Serve HLS playlists/segments and thumbnails straight off the data disk.
// Caddy fronts these paths but can't read /Volumes/... itself under the
// macOS system LaunchDaemon, so lawn-media doubles as the static server
// for the data volume. Auth is intentionally skipped — tailnet-only.
await app.register(fastifyStatic, {
  root: HLS_DIR,
  prefix: "/hls/",
  decorateReply: false,
  cacheControl: true,
  maxAge: 60 * 60 * 24,
});

await app.register(fastifyStatic, {
  root: THUMBS_DIR,
  prefix: "/thumbnails/",
  decorateReply: false,
  cacheControl: true,
  maxAge: 60 * 60 * 24,
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function verifyUploadToken(videoId: string, token: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const expected = createHmac("sha256", UPLOAD_SECRET)
    .update(videoId)
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(token, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function extFromFilename(filename: string | undefined): string {
  if (!filename) return "mp4";
  const last = filename.split(".").pop();
  if (!last) return "mp4";
  const ext = last.toLowerCase();
  return /^[a-z0-9]{2,6}$/.test(ext) ? ext : "mp4";
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)),
    );
  });
}

async function probeDuration(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      path,
    ]);
    let out = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}`));
      try {
        const info = JSON.parse(out) as { format?: { duration?: string } };
        const d = parseFloat(info.format?.duration ?? "0");
        resolve(Number.isFinite(d) ? d : 0);
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function postToConvex(path: string, body: unknown) {
  const res = await fetch(`${CONVEX_SITE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lawn-callback-secret": CALLBACK_SECRET,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Convex callback ${path} failed: ${res.status} ${text.slice(0, 200)}`,
    );
  }
}

async function transcode(videoId: string, sourcePath: string) {
  const hlsDir = `${HLS_DIR}/${videoId}`;
  const thumbPath = `${THUMBS_DIR}/${videoId}.jpg`;
  await mkdir(hlsDir, { recursive: true });

  try {
    await run("ffmpeg", [
      "-y",
      "-i", sourcePath,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-c:a", "aac",
      "-b:a", "128k",
      "-vf", "scale=-2:720",
      "-f", "hls",
      "-hls_time", "4",
      "-hls_playlist_type", "vod",
      "-hls_segment_filename", `${hlsDir}/seg-%03d.ts`,
      `${hlsDir}/master.m3u8`,
    ]);

    await run("ffmpeg", [
      "-y",
      "-ss", "00:00:01",
      "-i", sourcePath,
      "-vframes", "1",
      "-vf", "scale=640:-1",
      thumbPath,
    ]);

    const duration = await probeDuration(sourcePath);
    const fileSize = (await stat(sourcePath)).size;

    await postToConvex("/lawn/media/complete", {
      videoId,
      fileSize,
      duration,
      hlsUrl: `/hls/${videoId}/master.m3u8`,
      thumbnailUrl: `/thumbnails/${videoId}.jpg`,
    });
    app.log.info({ videoId, duration, fileSize }, "transcode complete");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    app.log.error({ videoId, err: message }, "transcode failed");
    await postToConvex("/lawn/media/failed", { videoId, error: message }).catch(
      (inner) => app.log.error({ inner }, "fail-notify errored"),
    );
  }
}

app.get("/health", async () => ({ ok: true }));

type UploadRequest = FastifyRequest<{
  Params: { videoId: string };
  Querystring: { token?: string; filename?: string };
}>;

app.route({
  method: "PUT",
  url: "/upload/:videoId",
  handler: async (req: UploadRequest, reply) => {
    const { videoId } = req.params;
    const token = req.query.token ?? "";
    const filename = req.query.filename;

    if (!verifyUploadToken(videoId, token)) {
      return reply.code(401).send({ error: "invalid upload token" });
    }

    const ext = extFromFilename(filename);
    const sourcePath = `${SOURCES_DIR}/${videoId}.${ext}`;
    await mkdir(dirname(sourcePath), { recursive: true });

    try {
      await pipeline(req.raw, createWriteStream(sourcePath));
    } catch (err) {
      await unlink(sourcePath).catch(() => {});
      throw err;
    }

    void transcode(videoId, sourcePath);

    return { ok: true };
  },
});

type SourceRequest = FastifyRequest<{
  Params: { videoId: string };
  Querystring: { token?: string };
}>;

app.get("/source/:videoId", async (req: SourceRequest, reply) => {
  const { videoId } = req.params;
  const token = req.query.token ?? "";
  if (!verifyUploadToken(videoId, token)) {
    return reply.code(401).send({ error: "invalid source token" });
  }

  for (const ext of ["mp4", "mov", "webm", "mkv", "m4v"]) {
    const p = `${SOURCES_DIR}/${videoId}.${ext}`;
    try {
      const s = await stat(p);
      reply
        .header("content-type", extContentType(ext))
        .header("content-length", String(s.size));
      return reply.send(createReadStream(p));
    } catch {
      // continue
    }
  }
  return reply.code(404).send({ error: "source not found" });
});

function extContentType(ext: string): string {
  switch (ext) {
    case "mp4":
    case "m4v":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "mkv":
      return "video/x-matroska";
    default:
      return "application/octet-stream";
  }
}

app.listen({ host: "0.0.0.0", port: PORT }, (err, address) => {
  if (err) {
    app.log.error(err, "failed to start");
    process.exit(1);
  }
  app.log.info(
    { address, DATA_DIR, CONVEX_SITE_URL },
    "lawn-media listening",
  );
});
