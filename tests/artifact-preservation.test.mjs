import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const cases = [
  ["artifacts/originals/workbuddy/agent-apps-scene.html", "public/originals/agent-apps-scene.html", "ebe1e2616f4282ac46fec6400ad043657cbdaa652e0b7a6cf97861bc5adfdf55"],
  ["artifacts/originals/workbuddy/github-monitor.html", "public/originals/github-monitor.html", "c5686da41a844f5a7f67f9531ef2ad85a9ce7411383d31c98273ef6eea6c33a9"],
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

for (const [canonical, publicCopy, expected] of cases) {
  test(`${publicCopy} remains byte-identical to canonical source`, async () => {
    const canonicalBytes = await readFile(canonical);
    const publicBytes = await readFile(publicCopy);
    assert.equal(sha256(canonicalBytes), expected);
    assert.equal(sha256(publicBytes), expected);
    assert.deepEqual(publicBytes, canonicalBytes);
  });
}
