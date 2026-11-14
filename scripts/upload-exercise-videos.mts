import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const execFileAsync = promisify(execFile);

const cwd = process.cwd();
const csvPath = path.join(cwd, "data", "exercise-videos.csv");
const uploadsDir = path.join(cwd, "video-uploads");

type CsvRow = Record<string, string>;

function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = lines[0].split(",").map((header) => header.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row: CsvRow = {};

    headers.forEach((header, index) => {
      row[header] = (values[index] ?? "").trim();
    });

    return row;
  });
}

function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".webm") return "video/webm";

  return "application/octet-stream";
}

async function hasFfmpeg() {
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

// Re-encodes to H.264/AAC mp4, capped at 1280px wide, with web-friendly
// faststart metadata. Cuts typical raw .mov clips from 30+MB to a few MB
// without a visible quality loss for short workout demo videos.
async function compressVideo(sourcePath: string, destPath: string) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    sourcePath,
    "-vf",
    "scale='min(1280,iw)':-2",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "26",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    destPath,
  ]);
}

function toMp4Key(key: string) {
  const ext = path.extname(key);
  return ext ? key.slice(0, -ext.length) + ".mp4" : `${key}.mp4`;
}

async function main() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    console.error(
      "Missing R2 env vars. Required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.",
    );
    process.exitCode = 1;
    return;
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const csvContent = await readFile(csvPath, "utf-8");
  const rows = parseCsv(csvContent).filter((row) => row.local_file && row.r2_key);

  if (rows.length === 0) {
    console.log(
      "No rows with both local_file and r2_key found in data/exercise-videos.csv. Nothing to upload.",
    );
    return;
  }

  const ffmpegAvailable = await hasFfmpeg();

  if (!ffmpegAvailable) {
    console.warn(
      "ffmpeg not found on PATH — uploading original files uncompressed. " +
        "Install with `brew install ffmpeg` for much smaller, faster-loading videos.",
    );
  }

  console.log(`Uploading ${rows.length} video reference(s) to bucket "${bucket}"...`);

  const tempDir = ffmpegAvailable ? await mkdtemp(path.join(tmpdir(), "fitmonk-videos-")) : null;
  const uploadedKeys = new Set<string>();

  for (const row of rows) {
    // A local_file that carries a path (has a `/`) is resolved against the
    // project root -- lets the CSV point at masters kept in a per-focus folder
    // like `Warmup videos/Chest Day/…`. A bare filename keeps the original
    // behaviour of resolving inside `video-uploads/`.
    const sourcePath = row.local_file.includes("/")
      ? path.isAbsolute(row.local_file)
        ? row.local_file
        : path.join(cwd, row.local_file)
      : path.join(uploadsDir, row.local_file);
    const uploadKey = ffmpegAvailable ? toMp4Key(row.r2_key) : row.r2_key;

    if (uploadedKeys.has(uploadKey)) {
      console.log(`  skipped ${row.local_file} -> ${uploadKey} (already uploaded this run)`);
      continue;
    }

    try {
      let uploadPath = sourcePath;

      if (ffmpegAvailable && tempDir) {
        const compressedPath = path.join(tempDir, `${path.parse(row.local_file).name}.mp4`);
        await compressVideo(sourcePath, compressedPath);
        uploadPath = compressedPath;
      }

      const body = await readFile(uploadPath);

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: uploadKey,
          Body: body,
          ContentType: contentTypeFor(uploadPath),
        }),
      );

      uploadedKeys.add(uploadKey);

      const sizeKb = Math.round(body.byteLength / 1024);
      console.log(`  uploaded ${row.local_file} -> ${uploadKey} (${sizeKb} KB)`);

      if (uploadKey !== row.r2_key) {
        console.log(`    note: r2_key in CSV should be updated to "${uploadKey}"`);
      }
    } catch (error) {
      console.error(`  failed ${row.local_file} -> ${row.r2_key}:`, (error as Error).message);
    }
  }

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }

  console.log("Done. Run `npm run videos:build` to regenerate the video map.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
