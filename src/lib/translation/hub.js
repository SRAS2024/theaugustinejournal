// src/lib/translation/hub.js
// Downloads model files from Hugging Face at a pinned revision and verifies
// each one against its SHA-256 before use, so a model can never change
// underneath the site and a corrupted download is never loaded.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";

const HUB = "https://huggingface.co";

function modelDirName(candidate) {
  return `${candidate.repo.replace(/[^\w.-]+/g, "--")}@${candidate.revision.slice(0, 12)}`;
}

async function sha256File(file) {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
}

async function verified(file, expected) {
  try {
    const stat = await fs.promises.stat(file);
    if (stat.size !== expected.size) return false;
    // Verification of a 600 MB file takes a few seconds; remember success.
    const marker = `${file}.sha256`;
    try {
      const recorded = await fs.promises.readFile(marker, "utf8");
      const markerStat = await fs.promises.stat(marker);
      if (recorded.trim() === expected.sha256 && markerStat.mtimeMs >= stat.mtimeMs) return true;
    } catch {
      /* no marker yet */
    }
    if ((await sha256File(file)) !== expected.sha256) return false;
    await fs.promises.writeFile(marker, expected.sha256);
    return true;
  } catch {
    return false;
  }
}

async function download(url, dest, expected, log) {
  const part = `${dest}.part`;
  const res = await fetch(url, {
    headers: { "User-Agent": "theaugustinejournal-translation/1" },
    redirect: "follow",
    signal: AbortSignal.timeout(30 * 60 * 1000)
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  const hash = crypto.createHash("sha256");
  let size = 0;
  const measure = new Transform({
    transform(chunk, _enc, done) {
      hash.update(chunk);
      size += chunk.length;
      done(null, chunk);
    }
  });
  await pipeline(Readable.fromWeb(res.body), measure, fs.createWriteStream(part));
  const digest = hash.digest("hex");
  if (size !== expected.size || digest !== expected.sha256) {
    await fs.promises.rm(part, { force: true });
    throw new Error(`Checksum mismatch for ${path.basename(dest)} (got ${size} bytes, ${digest.slice(0, 12)}…)`);
  }
  await fs.promises.rename(part, dest);
  await fs.promises.writeFile(`${dest}.sha256`, expected.sha256);
  log?.(`[translation] downloaded ${path.basename(dest)} (${(size / 1e6).toFixed(0)} MB)`);
}

/**
 * Make sure every file of a model candidate is present and verified.
 * Returns the directory holding the files.
 */
export async function ensureModelFiles(candidate, rootDir, { log = console.log, retries = 3 } = {}) {
  const dir = path.join(rootDir, modelDirName(candidate));
  await fs.promises.mkdir(dir, { recursive: true });
  for (const [name, expected] of Object.entries(candidate.files)) {
    const dest = path.join(dir, name);
    if (await verified(dest, expected)) continue;
    const url = `${HUB}/${candidate.repo}/resolve/${candidate.revision}/${name}`;
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await download(url, dest, expected, log);
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        log?.(`[translation] download of ${candidate.repo}/${name} failed (attempt ${attempt}/${retries}): ${err.message}`);
        if (attempt < retries) await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      }
    }
    if (lastError) throw lastError;
  }
  return dir;
}

/** Delete downloaded models other than the ones listed (frees disk space). */
export async function pruneModels(rootDir, keepCandidates) {
  const keep = new Set(keepCandidates.map(modelDirName));
  let entries = [];
  try {
    entries = await fs.promises.readdir(rootDir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (!keep.has(name)) await fs.promises.rm(path.join(rootDir, name), { recursive: true, force: true });
  }
}
