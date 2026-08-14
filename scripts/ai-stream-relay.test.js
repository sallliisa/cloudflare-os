import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";

import { createAiStreamRelay, validateUpstreamOrigin } from "./ai-stream-relay.mjs";

const encoder = new TextEncoder();

async function startRelay(t, options = {}) {
  const logs = [];
  const relay = createAiStreamRelay({
    upstreamOrigin: "https://upstream.example",
    port: 0,
    log: line => logs.push(line),
    ...options,
  });
  await relay.listen();
  t.after(() => relay.close());
  return {
    logs,
    origin: `http://127.0.0.1:${relay.server.address().port}`,
  };
}

async function readBody(body) {
  let text = "";
  for await (const chunk of body) text += chunk;
  return text;
}

function streamedResponse(chunks, init = {}) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }), init);
}

describe("validateUpstreamOrigin", () => {
  for (const value of [
    "http://upstream.example",
    "https://user:secret@upstream.example",
    "https://upstream.example/v1",
    "https://upstream.example/?query",
    "https://upstream.example/#fragment",
  ]) {
    it(`rejects ${value}`, () => {
      assert.throws(() => validateUpstreamOrigin(value), /must be an HTTPS origin/);
    });
  }

  it("accepts a plain HTTPS origin", () => {
    assert.equal(validateUpstreamOrigin("https://upstream.example").origin, "https://upstream.example");
  });
});

describe("AI stream relay", () => {
  it("answers health checks without contacting upstream", async t => {
    const { origin } = await startRelay(t, { fetchImpl: () => assert.fail("unexpected fetch") });
    const response = await fetch(`${origin}/healthz`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "ok\n");
  });

  it("rejects unsupported routes and methods without contacting upstream", async t => {
    const { origin } = await startRelay(t, { fetchImpl: () => assert.fail("unexpected fetch") });
    assert.equal((await fetch(`${origin}/other`)).status, 404);
    assert.equal((await fetch(`${origin}/v1/responses`)).status, 405);
  });

  it("forwards the fixed endpoint, permitted headers, and streamed request body", async t => {
    let received;
    const { origin } = await startRelay(t, {
      fetchImpl: async (url, init) => {
        received = { url: String(url), init, body: await readBody(init.body) };
        return new Response("done", { headers: { "content-type": "text/plain" } });
      },
    });
    const response = await fetch(`${origin}/v1/responses`, {
      method: "POST",
      headers: { authorization: "Bearer sentinel-token", "content-type": "application/json" },
      body: "sentinel-prompt",
    });
    assert.equal(await response.text(), "done");
    assert.equal(received.url, "https://upstream.example/v1/responses");
    assert.equal(received.init.method, "POST");
    assert.equal(received.init.headers.get("authorization"), "Bearer sentinel-token");
    assert.equal(received.init.headers.get("content-type"), "application/json");
    assert.equal(received.init.headers.get("connection"), null);
    assert.equal(received.init.headers.get("content-length"), null);
    assert.equal(received.init.headers.get("host"), null);
    assert.equal(received.body, "sentinel-prompt");
  });

  it("streams SSE while dropping unsafe response headers and sensitive logs", async t => {
    const { logs, origin } = await startRelay(t, {
      fetchImpl: async () => streamedResponse(["data: first\n\n", "data: sentinel-response\n\n"], {
        headers: {
          connection: "keep-alive, x-relay-hop",
          "content-encoding": "gzip",
          "content-length": "999",
          "content-type": "text/event-stream",
          "x-relay-hop": "sentinel-response",
        },
      }),
    });
    const response = await fetch(`${origin}/v1/responses`, {
      method: "POST",
      headers: { authorization: "Bearer sentinel-token", "content-type": "application/json" },
      body: "sentinel-prompt",
    });
    assert.equal(response.headers.get("content-type"), "text/event-stream");
    assert.equal(response.headers.get("content-encoding"), null);
    assert.equal(response.headers.get("content-length"), null);
    assert.equal(response.headers.get("x-relay-hop"), null);
    assert.equal(await response.text(), "data: first\n\ndata: sentinel-response\n\n");
    const output = logs.join("\n");
    for (const secret of ["sentinel-token", "sentinel-prompt", "sentinel-response"]) {
      assert.equal(output.includes(secret), false);
    }
  });

  it("returns 504 when an upstream request times out", async t => {
    const { origin } = await startRelay(t, {
      timeoutMs: 10,
      fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
      }),
    });
    assert.equal((await fetch(`${origin}/v1/responses`, { method: "POST", body: "{}" })).status, 504);
  });

  it("returns 502 for an upstream failure", async t => {
    const { origin } = await startRelay(t, { fetchImpl: async () => { throw new Error("upstream down"); } });
    assert.equal((await fetch(`${origin}/v1/responses`, { method: "POST", body: "{}" })).status, 502);
  });

  it("aborts upstream when the client disconnects", async t => {
    let resolveFetchCalled;
    const fetchCalled = new Promise(resolve => { resolveFetchCalled = resolve; });
    let resolveAborted;
    const aborted = new Promise(resolve => { resolveAborted = resolve; });
    const { origin } = await startRelay(t, {
      fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
        resolveFetchCalled();
        init.signal.addEventListener("abort", () => {
          resolveAborted();
          reject(init.signal.reason);
        }, { once: true });
      }),
    });
    const client = http.request(`${origin}/v1/responses`, { method: "POST" });
    client.on("error", () => {});
    client.end("{}");
    await fetchCalled;
    client.destroy();
    await aborted;
  });
});
