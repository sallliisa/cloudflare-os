#!/usr/bin/env node

// Deployment-only wrapper: production gatekeepers need their public URL rather than localhost.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = join(homedir(), "cloudflare-os");
const publicBaseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "");
if (!publicBaseUrl || !/^https?:\/\/[^/]+/.test(publicBaseUrl)) {
  throw new Error("PUBLIC_BASE_URL must be an absolute URL");
}

const serverPath = join(ROOT, "run-dev-server.js");
const patchedServerPath = join(ROOT, ".cfos-run-dev-server.mjs");
const serverSource = readFileSync(serverPath, "utf8");
const serverNeedle =
    '  config.vars.BASE_URL = `http://${backendHost}/gatekeeper/${gk.name.slice("gatekeeper-".length)}`;';
const serverReplacement =
    `  config.vars.BASE_URL = ${JSON.stringify(publicBaseUrl)} + "/gatekeeper/" + ` +
    'gk.name.slice("gatekeeper-".length);';
if (!serverSource.includes(serverNeedle)) {
  throw new Error("run-dev-server.js no longer has the expected BASE_URL generation");
}
writeFileSync(patchedServerPath, serverSource.replace(serverNeedle, serverReplacement));

const localPath = join(ROOT, "scripts", "run-local.mjs");
const patchedLocalPath = join(ROOT, "scripts", ".cfos-run-local.mjs");
const localSource = readFileSync(localPath, "utf8");
const localNeedle =
    '[join(ROOT, "run-dev-server.js"), "--serve-frontend-assets", ...passthroughArgs],';
const localReplacement =
    '[join(ROOT, ".cfos-run-dev-server.mjs"), "--serve-frontend-assets", ...passthroughArgs],';
if (!localSource.includes(localNeedle)) {
  throw new Error("run-local.mjs no longer has the expected server launch");
}
writeFileSync(patchedLocalPath, localSource.replace(localNeedle, localReplacement));

const child = spawn(process.execPath, [patchedLocalPath, ...process.argv.slice(2)], {
  cwd: ROOT,
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
