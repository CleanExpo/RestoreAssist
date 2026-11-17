/**
 * RA-8388 / amendment 01 D3 — the cross-runtime oracle.
 *
 * The client signs in a browser; the server verifies in Node. If the two
 * serialise the same payload to different bytes, every signature fails and the
 * user is told their evidence was altered. A test where the server hashes its
 * own output and agrees with itself cannot detect that, so this file does two
 * things that such a test does not:
 *
 *   1. The expected canonical bytes below were written BY HAND from the format
 *      definition — keys sorted, no whitespace, JSON.stringify string and
 *      number semantics — not captured from a run of the code under test. If
 *      the implementation drifts, these fail.
 *   2. The expected digests were computed with node:crypto over those
 *      hand-written strings, independently of the module's own canonicaliser.
 *
 * The file is run under both the node and jsdom environments by the Done
 * criterion `cross-runtime-digest`.
 *
 * KNOWN LIMIT, stated rather than papered over: vitest's jsdom environment
 * still executes in Node, so this proves the module is runtime-agnostic for
 * everything except a genuine browser JS engine. The vectors are chosen to
 * cover the three places engines have historically disagreed — non-ASCII
 * escaping, lone surrogates (well-formed JSON.stringify, ES2019) and shortest
 * round-trip number formatting — all of which are now spec-pinned. A real
 * browser run belongs in the Playwright suite and is not claimed here.
 */
import { describe, expect, it } from "vitest";

import {
  canonicalMetadataPayloadBytes,
  metadataPayloadSha256,
} from "../metadata-payload";

interface Vector {
  name: string;
  input: Parameters<typeof canonicalMetadataPayloadBytes>[0];
  bytes: string;
  sha256: string;
}

const VECTORS: Vector[] = [
  {
    name: "a plain moisture reading",
    input: {
      evidenceClass: "MOISTURE_READING",
      title: "Living room south wall",
      notes: "Pin meter, 150mm",
      structuredData: { measurementValue: 18.4, measurementUnit: "%" },
    },
    bytes:
      '{"description":"Pin meter, 150mm","evidenceClass":"MOISTURE_READING","payloadVersion":1,"structuredData":{"measurementUnit":"%","measurementValue":18.4},"title":"Living room south wall"}',
    sha256: "035bae83441b717f78b0a4731d79df3359ad71ffa8f8c1052149d1e9803844d1",
  },
  {
    name: "non-ASCII text, which JSON.stringify leaves literal",
    input: {
      evidenceClass: "TECHNICIAN_NOTE",
      title: "Café — 日本語",
    },
    bytes:
      '{"description":null,"evidenceClass":"TECHNICIAN_NOTE","payloadVersion":1,"structuredData":null,"title":"Café — 日本語"}',
    sha256: "a579f606aaefb56eef78e42d6b75e70d2d264318a60654fcbdf3b6790f25adda",
  },
  {
    name: "a lone surrogate, which must escape identically on both sides",
    input: { evidenceClass: "TECHNICIAN_NOTE", title: "\ud800" },
    bytes:
      '{"description":null,"evidenceClass":"TECHNICIAN_NOTE","payloadVersion":1,"structuredData":null,"title":"\\ud800"}',
    sha256: "70eb5e459d7292a5e201649d29c11f61cedbbbf6826c8a9882794c4a05208408",
  },
  {
    name: "a float that is not what it looks like (0.1 + 0.2)",
    input: {
      evidenceClass: "AMBIENT_ENVIRONMENTAL",
      title: "drift",
      structuredData: { value: 0.1 + 0.2 },
    },
    bytes:
      '{"description":null,"evidenceClass":"AMBIENT_ENVIRONMENTAL","payloadVersion":1,"structuredData":{"value":0.30000000000000004},"title":"drift"}',
    sha256: "e9e2f48e274a607ff1e342213d8b5cbd17c767f047c142c1435c7ea80cc8549f",
  },
  {
    name: "negative zero, which must serialise as 0",
    input: {
      evidenceClass: "AMBIENT_ENVIRONMENTAL",
      title: "zero",
      structuredData: { value: -0 },
    },
    bytes:
      '{"description":null,"evidenceClass":"AMBIENT_ENVIRONMENTAL","payloadVersion":1,"structuredData":{"value":0},"title":"zero"}',
    sha256: "4b4579c23baae97d20b813e667ed798fbb63cc8203e38ff9f8bc0dcc431bcd61",
  },
];

describe("canonical metadata bytes are identical across runtimes", () => {
  for (const vector of VECTORS) {
    it(`serialises ${vector.name} to the agreed bytes`, () => {
      expect(canonicalMetadataPayloadBytes(vector.input)).toBe(vector.bytes);
    });

    it(`digests ${vector.name} to the agreed hash`, async () => {
      await expect(metadataPayloadSha256(vector.input)).resolves.toBe(
        vector.sha256,
      );
    });
  }

  it("sorts keys rather than preserving insertion order", () => {
    // Insertion order here is deliberately the reverse of the sorted order.
    const bytes = canonicalMetadataPayloadBytes({
      structuredData: null,
      notes: null,
      title: "z",
      evidenceClass: "TECHNICIAN_NOTE",
    });
    expect(bytes.indexOf('"description"')).toBeLessThan(
      bytes.indexOf('"evidenceClass"'),
    );
    expect(bytes.indexOf('"evidenceClass"')).toBeLessThan(
      bytes.indexOf('"payloadVersion"'),
    );
    expect(bytes.indexOf('"payloadVersion"')).toBeLessThan(
      bytes.indexOf('"structuredData"'),
    );
    expect(bytes.indexOf('"structuredData"')).toBeLessThan(
      bytes.indexOf('"title"'),
    );
  });

  it("emits no whitespace", () => {
    expect(canonicalMetadataPayloadBytes(VECTORS[0].input)).not.toMatch(
      /:\s|\s,|\{\s|\s\}/,
    );
  });
});
