import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { appendAgentEvent, referencedImageIds } from "../shared/agent-store.ts";
import {
  IMAGE_ORPHAN_GRACE_MS,
  readImage,
  sweepOrphanImages,
  writeImage,
} from "../shared/images-store.ts";
import {
  emptyProviderStore,
  publicProviders,
  resolveUpstream,
  setActiveConnection,
  setProviderKey,
  setRole,
  writeProviderStore,
} from "../shared/providers.ts";
import { generateImage } from "../router/src/upstreams/images.ts";
import { RouterError } from "../router/src/errors.ts";
import { setConnectionLookup } from "../shared/connection-url.ts";
import { IMAGE_BYTES_MAX } from "../shared/images-store.ts";

// A 1x1 png, the smallest real image the store is asked to keep.
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function record(id: string) {
  return {
    id,
    mime: "image/png",
    b64: PNG_B64,
    prompt: "a small square",
    provider: "openai",
    model: "gpt-image-1",
  };
}

function age(dir: string, id: string, ms: number): void {
  const when = (Date.now() - ms) / 1000;
  utimesSync(join(dir, `${id}.json`), when, when);
}

/** A provider store written to a temp file; the env var stays set until the
 * async body finishes, so reads inside it cannot reach the real file. */
async function withImageStore<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "ub-images-"));
  const storePath = join(dir, "providers.json");
  const previous = process.env.UB_PROVIDERS_PATH;
  process.env.UB_PROVIDERS_PATH = storePath;
  try {
    return await run(dir);
  } finally {
    if (previous === undefined) delete process.env.UB_PROVIDERS_PATH;
    else process.env.UB_PROVIDERS_PATH = previous;
  }
}

test("an image record round-trips and bad ids and types are refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-images-"));
  writeImage(record("imgabcdef123"), dir);
  const loaded = readImage("imgabcdef123", dir);
  assert.equal(loaded?.id, "imgabcdef123");
  assert.equal(loaded?.mime, "image/png");
  assert.equal(loaded?.b64, PNG_B64);
  assert.equal(readImage("imgmissing1", dir), null);
  assert.throws(() => writeImage(record("../escape"), dir), /image_id/);
  assert.throws(() => writeImage({ ...record("imgabcdef124"), mime: "text/html" }, dir), /image_type/);
});

test("an image nothing names any more is swept, a fresh one survives", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-images-"));
  writeImage(record("imgkept00001"), dir);
  writeImage(record("imgorphan001"), dir);
  writeImage(record("imgfresh0001"), dir);
  age(dir, "imgkept00001", IMAGE_ORPHAN_GRACE_MS * 2);
  age(dir, "imgorphan001", IMAGE_ORPHAN_GRACE_MS * 2);
  const dropped = sweepOrphanImages(["imgkept00001"], dir);
  assert.deepEqual(dropped, ["imgorphan001"]);
  assert.deepEqual(readdirSync(dir).sort(), ["imgfresh0001.json", "imgkept00001.json"]);
});

test("referencedImageIds reads image events and refuses a store it cannot parse", () => {
  const dir = mkdtempSync(join(tmpdir(), "ub-images-"));
  const storePath = join(dir, "agents.json");
  const previous = process.env.UB_AGENT_STORE_PATH;
  process.env.UB_AGENT_STORE_PATH = storePath;
  try {
    writeFileSync(storePath, "{ this is not json");
    assert.equal(referencedImageIds(), null);
    writeFileSync(storePath, JSON.stringify({ schemaVersion: 1, threads: [], proposals: [], reserves: [] }));
    assert.deepEqual([...(referencedImageIds() ?? [])], []);

    appendAgentEvent("b1", { kind: "image", text: "a lighthouse", imageId: "imgkept00001" });
    assert.deepEqual([...(referencedImageIds() ?? [])], ["imgkept00001"]);
  } finally {
    if (previous === undefined) delete process.env.UB_AGENT_STORE_PATH;
    else process.env.UB_AGENT_STORE_PATH = previous;
  }
});

test("the image role resolves only a connection whose mode serves images", () => {
  // A text-only connection cannot be picked even when it is the active one.
  const chatOnly = setProviderKey(emptyProviderStore(), "opencode-go", "plan", "go-key-12345678");
  assert.throws(() => resolveUpstream(setActiveConnection(chatOnly, "opencode-go:plan"), "image", {}), /provider_incompatible/);

  // The capable connection is picked over the active text-only one.
  let store = setProviderKey(chatOnly, "openai", "api", "sk-test-abcdef1234");
  const resolved = resolveUpstream(store, "image", {});
  assert.equal(resolved.connection.id, "openai:api");
  assert.equal(resolved.modelId, "gpt-image-1");
  assert.equal(resolved.fallback, true);

  // An explicit image role pick wins and carries its model.
  store = setProviderKey(store, "xai", "api", "xai-key-12345678");
  store = setRole(store, "image", { connectionId: "xai:api", modelId: "grok-imagine-image", effort: null });
  const picked = resolveUpstream(store, "image", {});
  assert.equal(picked.connection.id, "xai:api");
  assert.equal(picked.modelId, "grok-imagine-image");
  assert.equal(picked.fallback, false);
});

test("the public image role lists capable connections only", () => {
  let store = setProviderKey(emptyProviderStore(), "opencode-go", "plan", "go-key-12345678");
  let pub = publicProviders(setActiveConnection(store, "opencode-go:plan"), {});
  // Nothing image-capable is connected: no pick, an empty picker.
  assert.equal(pub.roles.image.connectionId, null);
  assert.deepEqual(pub.roles.image.models, []);

  store = setProviderKey(store, "zai", "api", "zai-key-12345678");
  pub = publicProviders(store, {});
  const ids = pub.roles.image.models.map((row) => row.id);
  assert.ok(ids.includes("glm-image"));
  assert.ok(pub.roles.image.models.every((row) => row.connectionId === "zai:api"));
  // The fallback pick is the capable connection's first model.
  assert.equal(pub.roles.image.connectionId, "zai:api");
  assert.equal(pub.roles.image.modelId, "glm-image");
});

test("generateImage posts the OpenAI shape and returns the b64 data", async () => {
  await withImageStore(async (dir) => {
    let store = setProviderKey(emptyProviderStore(), "openai", "api", "sk-test-abcdef1234");
    writeProviderStore(store, join(dir, "providers.json"));

    const seen: Array<{ url: string; body: Record<string, unknown>; auth: string | null }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({
        url: String(url),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        auth: (init?.headers as Record<string, string> | undefined)?.authorization ?? null,
      });
      return new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 });
    }) as typeof fetch;

    const out = await generateImage({ prompt: "a fox", size: "wide", n: 1, signal: AbortSignal.timeout(5_000), fetchImpl });
    assert.equal(seen[0]?.url, "https://api.openai.com/v1/images/generations");
    assert.equal(seen[0]?.auth, "Bearer sk-test-abcdef1234");
    assert.deepEqual(seen[0]?.body, { model: "gpt-image-1", prompt: "a fox", n: 1, size: "1536x1024" });
    assert.equal(out.providerId, "openai");
    assert.equal(out.model, "gpt-image-1");
    assert.equal(out.images.length, 1);
    assert.equal(out.images[0]?.b64, PNG_B64);
    assert.equal(out.images[0]?.mime, "image/png");
  });
});

test("generateImage speaks aspect_ratio to xAI and downloads a url answer", async () => {
  await withImageStore(async (dir) => {
    const store = setProviderKey(emptyProviderStore(), "xai", "api", "xai-key-12345678");
    writeProviderStore(store, join(dir, "providers.json"));

    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(String(url));
      if (calls.length === 1) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        assert.equal(body.aspect_ratio, "16:9");
        assert.equal(body.size, undefined);
        return new Response(JSON.stringify({ data: [{ url: "https://cdn.example/img.png" }] }), { status: 200 });
      }
      return new Response(Buffer.from(PNG_B64, "base64"), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as typeof fetch;

    setConnectionLookup(async () => "8.8.8.8");
    try {
      const out = await generateImage({ prompt: "a fox", size: "wide", n: 1, signal: AbortSignal.timeout(5_000), fetchImpl });
      assert.deepEqual(calls, ["https://api.x.ai/v1/images/generations", "https://cdn.example/img.png"]);
      assert.equal(out.images[0]?.mime, "image/png");
      assert.equal(out.images[0]?.b64, PNG_B64);
    } finally {
      setConnectionLookup(null);
    }
  });
});

test("generateImage maps a 401 to auth_failed and a 429 to a retryable limit", async () => {
  await withImageStore(async (dir) => {
    const store = setProviderKey(emptyProviderStore(), "openai", "api", "sk-test-abcdef1234");
    writeProviderStore(store, join(dir, "providers.json"));

    const unauthorized = (async () => new Response("{}", { status: 401 })) as typeof fetch;
    const err401 = await generateImage({ prompt: "x", n: 1, signal: AbortSignal.timeout(5_000), fetchImpl: unauthorized }).catch((e) => e);
    assert.ok(err401 instanceof RouterError);
    assert.equal(err401.code, "upstream_auth_failed");

    const limited = (async () => new Response("{}", { status: 429, headers: { "retry-after": "2" } })) as typeof fetch;
    const err429 = await generateImage({ prompt: "x", n: 1, signal: AbortSignal.timeout(5_000), fetchImpl: limited }).catch((e) => e);
    assert.ok(err429 instanceof RouterError);
    assert.equal(err429.code, "upstream_rate_limited");
    assert.equal(err429.retryable, true);
  });
});

test("a url answer is screened before a byte is fetched", async () => {
  await withImageStore(async (dir) => {
    const store = setProviderKey(emptyProviderStore(), "xai", "api", "xai-key-12345678");
    writeProviderStore(store, join(dir, "providers.json"));

    for (const bad of [
      "http://cdn.example/img.png",
      "https://127.0.0.1/img.png",
      "https://169.254.169.254/latest/meta-data",
      "https://user:pass@cdn.example/img.png",
      "https://cdn.example:8443/img.png",
      "https://localhost/img.png",
    ]) {
      const calls: string[] = [];
      const fetchImpl = (async (url: string | URL | Request) => {
        calls.push(String(url));
        return new Response(JSON.stringify({ data: [{ url: bad }] }), { status: 200 });
      }) as typeof fetch;
      const err = await generateImage({ prompt: "x", n: 1, signal: AbortSignal.timeout(5_000), fetchImpl }).catch((e) => e);
      assert.ok(err instanceof RouterError, bad);
      assert.equal(err.code, "upstream_protocol_error", bad);
      // The download was refused before fetch: only the generations call ran.
      assert.equal(calls.length, 1, bad);
    }

    // A public name that resolves to a private address is refused the same way.
    setConnectionLookup(async () => "10.0.0.4");
    try {
      const calls: string[] = [];
      const fetchImpl = (async (url: string | URL | Request) => {
        calls.push(String(url));
        return new Response(JSON.stringify({ data: [{ url: "https://cdn.example/img.png" }] }), { status: 200 });
      }) as typeof fetch;
      const err = await generateImage({ prompt: "x", n: 1, signal: AbortSignal.timeout(5_000), fetchImpl }).catch((e) => e);
      assert.ok(err instanceof RouterError);
      assert.equal(err.code, "upstream_protocol_error");
      assert.equal(calls.length, 1);
    } finally {
      setConnectionLookup(null);
    }
  });
});

test("the download cap is enforced while streaming, not after buffering", async () => {
  await withImageStore(async (dir) => {
    const store = setProviderKey(emptyProviderStore(), "xai", "api", "xai-key-12345678");
    writeProviderStore(store, join(dir, "providers.json"));

    const oversized = Buffer.alloc(IMAGE_BYTES_MAX + 8, 0x89);
    const fetchImpl = (async (url: string | URL | Request) => {
      if (String(url).includes("images/generations")) {
        return new Response(JSON.stringify({ data: [{ url: "https://cdn.example/big.png" }] }), { status: 200 });
      }
      // A declared length past the cap is refused before the body is read.
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(oversized);
          controller.close();
        },
      }), { status: 200, headers: { "content-type": "image/png", "content-length": String(oversized.length) } });
    }) as typeof fetch;

    setConnectionLookup(async () => "8.8.8.8");
    try {
      const err = await generateImage({ prompt: "x", n: 1, signal: AbortSignal.timeout(5_000), fetchImpl }).catch((e) => e);
      assert.ok(err instanceof RouterError);
      assert.equal(err.code, "upstream_protocol_error");
    } finally {
      setConnectionLookup(null);
    }
  });
});

test("an oversized b64_json answer is refused instead of stored", async () => {
  await withImageStore(async (dir) => {
    const store = setProviderKey(emptyProviderStore(), "openai", "api", "sk-test-abcdef1234");
    writeProviderStore(store, join(dir, "providers.json"));

    const big = Buffer.alloc(IMAGE_BYTES_MAX + 4, 0x89).toString("base64");
    const fetchImpl = (async () => new Response(
      JSON.stringify({ data: [{ b64_json: big }] }),
      { status: 200 },
    )) as typeof fetch;
    const err = await generateImage({ prompt: "x", n: 1, signal: AbortSignal.timeout(10_000), fetchImpl }).catch((e) => e);
    assert.ok(err instanceof RouterError);
    assert.equal(err.code, "upstream_protocol_error");
  });
});

test("a generations body past the response cap is refused", async () => {
  await withImageStore(async (dir) => {
    const store = setProviderKey(emptyProviderStore(), "openai", "api", "sk-test-abcdef1234");
    writeProviderStore(store, join(dir, "providers.json"));

    const fetchImpl = (async () => new Response("x", {
      status: 200,
      headers: { "content-length": String(4 * Math.ceil(IMAGE_BYTES_MAX * 4 / 3) + 2_000_000) },
    })) as typeof fetch;
    const err = await generateImage({ prompt: "x", n: 1, signal: AbortSignal.timeout(5_000), fetchImpl }).catch((e) => e);
    assert.ok(err instanceof RouterError);
    assert.equal(err.code, "upstream_protocol_error");
  });
});

test("dall-e-3 takes its own sizes and a single image per call", async () => {
  await withImageStore(async (dir) => {
    let store = setProviderKey(emptyProviderStore(), "openai", "api", "sk-test-abcdef1234");
    store = setRole(store, "image", { connectionId: "openai:api", modelId: "dall-e-3", effort: null });
    writeProviderStore(store, join(dir, "providers.json"));

    const seen: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 });
    }) as typeof fetch;

    await generateImage({ prompt: "x", size: "wide", n: 4, signal: AbortSignal.timeout(5_000), fetchImpl });
    assert.equal(seen[0]?.size, "1792x1024");
    assert.equal(seen[0]?.n, 1);
    await generateImage({ prompt: "x", size: "tall", n: 1, signal: AbortSignal.timeout(5_000), fetchImpl });
    assert.equal(seen[1]?.size, "1024x1792");
    await generateImage({ prompt: "x", size: "square", n: 1, signal: AbortSignal.timeout(5_000), fetchImpl });
    assert.equal(seen[2]?.size, "1024x1024");
  });
});

test("zai takes its documented pixel sizes", async () => {
  await withImageStore(async (dir) => {
    const store = setProviderKey(emptyProviderStore(), "zai", "api", "zai-key-12345678");
    writeProviderStore(store, join(dir, "providers.json"));

    const seen: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 });
    }) as typeof fetch;

    await generateImage({ prompt: "x", size: "wide", n: 1, signal: AbortSignal.timeout(5_000), fetchImpl });
    assert.equal(seen[0]?.size, "1568x1056");
    assert.equal(seen[0]?.aspect_ratio, undefined);
  });
});

test("a text-only connection cannot be written as the image role", () => {
  const store = setProviderKey(emptyProviderStore(), "opencode-go", "plan", "go-key-12345678");
  assert.throws(
    () => setRole(store, "image", { connectionId: "opencode-go:plan", modelId: "anything", effort: null }),
    /provider_incompatible/,
  );
});

test("a b64 answer whose mime is not an image is refused", async () => {
  await withImageStore(async (dir) => {
    const store = setProviderKey(emptyProviderStore(), "openai", "api", "sk-test-abcdef1234");
    writeProviderStore(store, join(dir, "providers.json"));

    // A valid base64 payload that sniffs to nothing known.
    const notImage = Buffer.from("<html><body>not a picture</body></html>").toString("base64");
    const fetchImpl = (async () => new Response(
      JSON.stringify({ data: [{ b64_json: notImage }] }),
      { status: 200 },
    )) as typeof fetch;
    const err = await generateImage({ prompt: "x", n: 1, signal: AbortSignal.timeout(5_000), fetchImpl }).catch((e) => e);
    assert.ok(err instanceof RouterError);
    assert.equal(err.code, "upstream_protocol_error");
  });
});

test("a url answer with a non-image content type is refused", async () => {
  await withImageStore(async (dir) => {
    const store = setProviderKey(emptyProviderStore(), "xai", "api", "xai-key-12345678");
    writeProviderStore(store, join(dir, "providers.json"));

    const fetchImpl = (async (url: string | URL | Request) => {
      if (String(url).includes("images/generations")) {
        return new Response(JSON.stringify({ data: [{ url: "https://cdn.example/img.pngx" }] }), { status: 200 });
      }
      return new Response("not image bytes", { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;

    setConnectionLookup(async () => "8.8.8.8");
    try {
      const err = await generateImage({ prompt: "x", n: 1, signal: AbortSignal.timeout(5_000), fetchImpl }).catch((e) => e);
      assert.ok(err instanceof RouterError);
      assert.equal(err.code, "upstream_protocol_error");
    } finally {
      setConnectionLookup(null);
    }
  });
});
