#!/usr/bin/env node

import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const RESPONSE_ONLY_DROPPED_HEADERS = new Set(["content-encoding", "content-length"]);
const DEFAULT_PORT = 18789;
const DEFAULT_TIMEOUT_MS = 12 * 60 * 1000;
const SCRIPT_PATH = fileURLToPath(import.meta.url);

/** Validates the fixed HTTPS origin used for every relayed request. */
export function validateUpstreamOrigin(value) {
  let origin;
  try {
    origin = new URL(value);
  } catch {
    throw new Error("AI_STREAM_RELAY_UPSTREAM_ORIGIN must be an HTTPS origin");
  }

  if (origin.protocol !== "https:" || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("AI_STREAM_RELAY_UPSTREAM_ORIGIN must be an HTTPS origin");
  }
  return origin;
}

/** Validates the port used by the loopback-only relay listener. */
export function validatePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("AI_STREAM_RELAY_PORT must be an integer between 0 and 65535");
  }
  return port;
}

/** Returns whether Node or PM2 launched this module as the relay process. */
export function isRelayEntrypoint(argv, environment) {
  return argv[1] === SCRIPT_PATH || environment.pm_id !== undefined;
}

function requestHeaders(headers) {
  const dropped = new Set(["host", "content-length", ...HOP_BY_HOP_HEADERS]);
  for (const value of headers.connection?.split(",") ?? []) {
    dropped.add(value.trim().toLowerCase());
  }

  const forwarded = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (dropped.has(name) || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) forwarded.append(name, item);
  }
  return forwarded;
}

function responseHeaders(headers) {
  const dropped = new Set([...HOP_BY_HOP_HEADERS, ...RESPONSE_ONLY_DROPPED_HEADERS]);
  for (const value of headers.get("connection")?.split(",") ?? []) {
    dropped.add(value.trim().toLowerCase());
  }
  const forwarded = [];
  for (const [name, value] of headers) {
    if (!dropped.has(name)) {
      forwarded.push([name, value]);
    }
  }
  return forwarded;
}

function safeError(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : "UnknownError";
}

/** Creates a loopback-only relay for the fixed OpenAI Responses endpoint. */
export function createAiStreamRelay({
  upstreamOrigin,
  port = DEFAULT_PORT,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  log = console.log,
}) {
  const origin = validateUpstreamOrigin(upstreamOrigin);
  const listenPort = validatePort(port);
  const server = createServer(async (request, response) => {
    const startedAt = Date.now();
    const requestId = crypto.randomUUID();
    const writeLog = (event, fields = {}) => log(JSON.stringify({
      requestId,
      event,
      method: request.method,
      path: request.url?.split("?")[0],
      durationMs: Date.now() - startedAt,
      ...fields,
    }));

    if (request.method === "GET" && request.url === "/healthz") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("ok\n");
      writeLog("healthz", { outcome: "ok" });
      return;
    }
    if (request.url?.split("?")[0] !== "/v1/responses") {
      response.writeHead(404).end();
      writeLog("rejected", { outcome: "not_found" });
      return;
    }
    if (request.method !== "POST") {
      response.writeHead(405, { allow: "POST" }).end();
      writeLog("rejected", { outcome: "method_not_allowed" });
      return;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error("upstream timeout"));
    }, timeoutMs);
    const abortForClient = () => {
      if (!response.writableEnded) controller.abort(new Error("client disconnected"));
    };
    request.once("aborted", abortForClient);
    response.once("close", abortForClient);

    try {
      let upstream;
      try {
        upstream = await fetchImpl(new URL("/v1/responses", origin), {
          method: "POST",
          headers: requestHeaders(request.headers),
          body: request,
          duplex: "half",
          redirect: "manual",
          signal: controller.signal,
        });
      } catch (error) {
        if (!response.destroyed) response.writeHead(timedOut ? 504 : 502).end();
        writeLog("upstream_failed", {
          outcome: timedOut ? "timeout" : "failed",
          error: safeError(error),
        });
        return;
      }

      response.writeHead(upstream.status, responseHeaders(upstream.headers));
      if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), response);
      else response.end();
      writeLog("stream_finished", { outcome: "ok", upstreamStatus: upstream.status });
    } catch (error) {
      if (!response.headersSent && !response.destroyed) response.writeHead(502).end();
      else if (!response.writableEnded) response.destroy(error);
      writeLog("stream_failed", { outcome: "failed", error: safeError(error) });
    } finally {
      clearTimeout(timeout);
      request.off("aborted", abortForClient);
      response.off("close", abortForClient);
    }
  });

  return {
    server,
    listen: () => new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(listenPort, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    }),
    close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  };
}

if (isRelayEntrypoint(process.argv, process.env)) {
  const relay = createAiStreamRelay({
    upstreamOrigin: process.env.AI_STREAM_RELAY_UPSTREAM_ORIGIN,
    port: process.env.AI_STREAM_RELAY_PORT ?? DEFAULT_PORT,
  });
  await relay.listen();
  console.log(JSON.stringify({ event: "listening", host: "127.0.0.1", port: relay.server.address().port }));
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => relay.close().finally(() => process.exit(0)));
  }
}
