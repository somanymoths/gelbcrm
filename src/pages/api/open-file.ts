import type { NextApiRequest, NextApiResponse } from "next";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const raw = req.query.path;
  const filePath = Array.isArray(raw) ? raw[0] : raw;
  if (!filePath) {
    res.status(400).json({ ok: false, error: "Missing path" });
    return;
  }

  const resolved = path.resolve(filePath);
  const workflowRoot = path.resolve(process.cwd(), "workflow");
  if (!resolved.startsWith(workflowRoot)) {
    res.status(403).json({ ok: false, error: "Path is outside workflow" });
    return;
  }
  if (!fs.existsSync(resolved)) {
    res.status(404).json({ ok: false, error: "File not found" });
    return;
  }

  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? "open"
      : platform === "win32"
      ? "cmd"
      : "xdg-open";
  const args =
    platform === "darwin"
      ? [resolved]
      : platform === "win32"
      ? ["/c", "start", "", resolved]
      : [resolved];

  execFile(cmd, args, (error) => {
    if (error) {
      res.status(500).json({ ok: false, error: error.message });
      return;
    }
    const back = req.headers.referer || "/worktree";
    res.redirect(302, back);
  });
}
