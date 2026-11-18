import { describe, expect, it } from "vitest";
import { readBoundedBody } from "../bounded-body";

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
  });
}

describe("readBoundedBody", () => {
  it("returns the bytes when under the cap", async () => {
    const res = await readBoundedBody(
      new Request("http://x.test", { method: "POST", body: "hello" }),
      10,
    );
    expect(res?.toString()).toBe("hello");
  });

  it("returns null when the real stream exceeds the cap, ignoring a lying Content-Length", async () => {
    const body = streamOf([new Uint8Array(6), new Uint8Array(6)]);
    const req = {
      headers: new Headers({ "content-length": "3" }),
      body,
    } as unknown as Request;
    expect(await readBoundedBody(req, 10)).toBeNull();
  });

  it("stops reading once the cap is passed", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        c.enqueue(new Uint8Array(8));
      },
    });
    const req = { headers: new Headers(), body } as unknown as Request;
    expect(await readBoundedBody(req, 10)).toBeNull();
    expect(pulled).toBeLessThan(5);
  });
});
