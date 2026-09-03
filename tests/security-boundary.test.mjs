import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const browserRoots = ["components"];
const browserFiles = [
  "app/layout.tsx",
  "app/page.tsx",
  "app/mission-control/page.tsx",
  "app/github/page.tsx",
];

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  }));
  return nested.flat();
}

const secretValuePatterns = [
  /sb_secret_[A-Za-z0-9._-]{16,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
];

const privilegedNames = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "GITHUB_TOKEN",
  "MCF_INGEST_HMAC_SECRET",
];

test("env example declares server variables with blank values only", async () => {
  const text = await readFile(".env.example", "utf8");
  assert.equal(text, [
    "SUPABASE_URL=",
    "SUPABASE_SERVICE_ROLE_KEY=",
    "GITHUB_TOKEN=",
    "MCF_INGEST_HMAC_SECRET=",
    "",
  ].join("\n"));
});

test("browser-facing shell sources do not reference privileged env names", async () => {
  const files = [...browserFiles];
  for (const root of browserRoots) files.push(...await collectFiles(root));
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.equal(text.includes("process.env"), false, `${file} must not read process.env`);
    for (const name of privilegedNames) {
      assert.equal(text.includes(name), false, `${file} exposes ${name}`);
    }
  }
});


test("application sources contain no secret-shaped credential values", async () => {
  const files = [
    ...browserFiles,
    ...await collectFiles("components"),
    ...await collectFiles("lib"),
    ...await collectFiles("app/api"),
  ];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const pattern of secretValuePatterns) {
      assert.equal(pattern.test(text), false, `${file} contains a secret-shaped value`);
    }
  }
});
