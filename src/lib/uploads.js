// src/lib/uploads.js
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve uploads dir relative to project root (two levels up from src/lib/)
const UPLOADS_DIR = path.resolve(__dirname, "../../uploads");

export function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  return UPLOADS_DIR;
}

export function getUploadsDir() {
  return UPLOADS_DIR;
}
