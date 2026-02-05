import path from "path";
import fs from "fs";

const defaultDir = path.join(process.cwd(), "uploads");

export function getUploadsDir() {
  const dir = process.env.UPLOAD_DIR || defaultDir;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolveUploadPath(urlPath) {
  const filename = path.basename(urlPath);
  return path.join(getUploadsDir(), filename);
}
