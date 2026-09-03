# E4 Next.js Control Center Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and locally validate the smallest Next.js shell for MCF Control Center while preserving the two WorkBuddy HTML artifacts byte-for-byte and stopping before any Vercel deploy/public URL.

**Architecture:** One Next.js App Router application provides stable shell routes and future server integration boundaries. The canonical WorkBuddy HTML files remain immutable under `artifacts/originals/workbuddy/`; byte-identical deployable copies live under `public/originals/` and render inside shell routes through iframes. Supabase/GitHub/MCF privileged configuration remains server-side only.

**Tech Stack:** Node.js 22.23.2, npm 10.9.8, Next.js 15.5.25, React 19.2.8, React DOM 19.2.8, TypeScript 5.9.3, Vitest 4.1.11, built-in `node:test`, Google Chrome 148 for manual browser smoke evidence.

**Spec:** `docs/superpowers/specs/2026-09-03-e4-nextjs-control-center-shell-design.md`

## Global Constraints

- Work only on branch `mission/mcf-control-center-001` in an isolated worktree created at execution time.
- Never modify `artifacts/originals/workbuddy/agent-apps-scene.html` or `artifacts/originals/workbuddy/github-monitor.html`.
- Canonical Mission Control SHA-256 is `ebe1e2616f4282ac46fec6400ad043657cbdaa652e0b7a6cf97861bc5adfdf55`.
- Canonical GitPulse SHA-256 is `c5686da41a844f5a7f67f9531ef2ad85a9ce7411383d31c98273ef6eea6c33a9`.
- No browser/client code may contain Supabase service-role credentials, GitHub private tokens, MCF HMAC secrets, deployment credentials, or infrastructure credentials.
- No client-side Supabase access is introduced in E4; the existing RLS default-deny posture remains unchanged.
- Do not implement GitHub live ingestion, MCF ingest/outbound, agent command/control, or authenticated browser users in this plan.
- Do not merge PR #2.
- Do not click Vercel `Deploy`, create a public Vercel URL, or publish externally without a new explicit HUMAN_GATE from LEANDRO after local evidence is presented.
- Keep the app deployable in a standard Node runtime; do not introduce proprietary Vercel-only business logic.

---## File Structure

**Create:**
- `package.json` — exact dependency versions and local verification scripts.
- `package-lock.json` — npm lockfile generated from exact versions.
- `tsconfig.json` — strict TypeScript/Next.js compiler configuration.
- `next-env.d.ts` — standard Next.js TypeScript declarations.
- `next.config.ts` — standard Node-compatible Next.js config with standalone output.
- `vitest.config.ts` — Node-environment unit-test configuration.
- `.env.example` — variable names only; all values blank.
- `app/layout.tsx` — minimal root layout.
- `app/globals.css` — shell-only styles; does not restyle preserved HTML.
- `app/page.tsx` — landing/navigation page.
- `app/mission-control/page.tsx` — preserved Mission Control shell route.
- `app/github/page.tsx` — preserved GitPulse shell route.
- `app/api/health/route.ts` — non-secret health endpoint.
- `components/baseline-frame.tsx` — reusable iframe + baseline/provenance notice.
- `lib/server/env.ts` — explicit server configuration reader; no fake fallback.
- `public/originals/agent-apps-scene.html` — byte-identical deployment copy.
- `public/originals/github-monitor.html` — byte-identical deployment copy.
- `tests/artifact-preservation.test.mjs` — hard SHA invariant.
- `tests/routes.test.tsx` — route/component contract tests.
- `tests/server-boundary.test.ts` — health/config error behavior.
- `tests/security-boundary.test.mjs` — secret/client-boundary checks.
- `docs/e4/E4-WEB-SHELL-LOCAL-VALIDATION.md` — local build/smoke receipt.
- `docs/evidence/e4/WEB-SHELL-MISSION-CONTROL-LOCAL.png` — browser proof.
- `docs/evidence/e4/WEB-SHELL-GITHUB-LOCAL.png` — browser proof.

**Modify:**
- `.gitignore` — ignore `.next`, `node_modules`, local `.env*` while allowing `.env.example`.
- `docs/MISSION-MCF-CONTROL-CENTER-001.md` — record local shell checkpoint after verification.
- `docs/superpowers/specs/2026-09-03-e4-nextjs-control-center-shell-design.md` — update status only; no design change.

---

### Task 1: Lock artifact preservation before adding the web app

**Files:**
- Create: `tests/artifact-preservation.test.mjs`
- Create: `public/originals/agent-apps-scene.html`
- Create: `public/originals/github-monitor.html`

**Interfaces:**
- Consumes: canonical artifact paths and SHA-256 values from the approved spec.
- Produces: deployable public copies whose bytes are proven identical to the canonical originals.

- [ ] **Step 1: Write the failing artifact preservation test**

Create `tests/artifact-preservation.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the preservation test and verify RED**

Run:

```bash
node --test tests/artifact-preservation.test.mjs
```

Expected: FAIL because `public/originals/*.html` do not exist yet. The canonical-source hash assertions must not fail.

- [ ] **Step 3: Create only the byte-identical deployment copies**

Run:

```bash
mkdir -p public/originals
cp artifacts/originals/workbuddy/agent-apps-scene.html public/originals/agent-apps-scene.html
cp artifacts/originals/workbuddy/github-monitor.html public/originals/github-monitor.html
```

Do not open either canonical HTML file in an editor during this step.

- [ ] **Step 4: Re-run the preservation test and verify GREEN**

Run:

```bash
node --test tests/artifact-preservation.test.mjs
sha256sum artifacts/originals/workbuddy/*.html public/originals/*.html
```

Expected: both tests PASS; canonical and public pairs report their approved SHA-256 values exactly.

- [ ] **Step 5: Commit the preservation checkpoint**

```bash
git add tests/artifact-preservation.test.mjs public/originals
git commit -m "test: lock preserved control center artifacts"
```

---

### Task 2: Scaffold the Next.js shell and satisfy route contracts

**Files:**
- Create: `package.json`, `package-lock.json`, `tsconfig.json`, `next-env.d.ts`, `next.config.ts`, `vitest.config.ts`
- Create: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`
- Create: `components/baseline-frame.tsx`
- Create: `app/mission-control/page.tsx`, `app/github/page.tsx`
- Create: `tests/routes.test.tsx`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: public preserved HTML copies from Task 1.
- Produces: `BaselineFrame({ title, src, notice })`, landing route `/`, baseline routes `/mission-control` and `/github`.

- [ ] **Step 1: Add exact package metadata and test/build tooling**

Create `package.json` exactly:

```json
{
  "name": "mcf-control-center",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test:unit": "vitest run tests/routes.test.tsx tests/server-boundary.test.ts",
    "test:artifacts": "node --test tests/artifact-preservation.test.mjs",
    "test:security": "node --test tests/security-boundary.test.mjs",
    "test": "npm run test:artifacts && npm run test:unit && npm run test:security",
    "typecheck": "tsc --noEmit",
    "verify": "npm test && npm run typecheck && npm run build"
  },
  "dependencies": {
    "next": "15.5.25",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@types/node": "22.20.1",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.5",
    "typescript": "5.9.3",
    "vitest": "4.1.11"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `next-env.d.ts`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
});
```

Update `.gitignore` to include `node_modules/`, `.next/`, `.env*`, and `!.env.example` without removing existing ignore rules.

Run `npm install` to generate `package-lock.json` from the exact versions above.

- [ ] **Step 2: Write route contract tests before route implementation**

Create `tests/routes.test.tsx`:

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

async function requiredImport<T>(loader: () => Promise<T>, label: string): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    throw new Error(`Required route module missing: ${label}`, { cause: error });
  }
}

const render = (element: React.ReactNode) => renderToStaticMarkup(<>{element}</>);

describe("Control Center route contract", () => {
  it("landing links to both preserved surfaces", async () => {
    const module = await requiredImport(() => import("../app/page"), "app/page.tsx");
    const html = render(React.createElement(module.default));
    expect(html).toContain('href="/mission-control"');
    expect(html).toContain('href="/github"');
  });

  it("mission control embeds the preserved baseline and labels it as baseline", async () => {
    const module = await requiredImport(
      () => import("../app/mission-control/page"),
      "app/mission-control/page.tsx",
    );
    const html = render(React.createElement(module.default));
    expect(html).toContain('src="/originals/agent-apps-scene.html"');
    expect(html).toContain("BASELINE PRESERVADO");
    expect(html).not.toContain("LIVE DATA");
  });

  it("github embeds the preserved GitPulse artifact and labels shell integration status", async () => {
    const module = await requiredImport(() => import("../app/github/page"), "app/github/page.tsx");
    const html = render(React.createElement(module.default));
    expect(html).toContain('src="/originals/github-monitor.html"');
    expect(html).toContain("ARTEFATO ORIGINAL PRESERVADO");
    expect(html).toContain("integração Control Center ainda não ativa");
  });
});
```

- [ ] **Step 3: Run the route tests and verify RED**

Run:

```bash
npx vitest run tests/routes.test.tsx
```

Expected: FAIL with `Required route module missing: app/page.tsx` or the first missing route module. This is the expected feature-missing failure, not a syntax/configuration error.

- [ ] **Step 4: Implement the minimum shell routes**

Create `components/baseline-frame.tsx`:

```tsx
type BaselineFrameProps = {
  title: string;
  src: string;
  notice: string;
};

export function BaselineFrame({ title, src, notice }: BaselineFrameProps) {
  return (
    <main className="baseline-shell">
      <header className="baseline-banner">
        <strong>{title}</strong>
        <span>{notice}</span>
      </header>
      <iframe className="baseline-frame" src={src} title={title} />
    </main>
  );
}
```

Create `app/mission-control/page.tsx`:

```tsx
import { BaselineFrame } from "../../components/baseline-frame";

export default function MissionControlPage() {
  return (
    <BaselineFrame
      title="BASELINE PRESERVADO — Mission Control"
      notice="Snapshot histórico preservado; não representa estado LIVE do MCF."
      src="/originals/agent-apps-scene.html"
    />
  );
}
```

Create `app/github/page.tsx`:

```tsx
import { BaselineFrame } from "../../components/baseline-frame";

export default function GitHubPage() {
  return (
    <BaselineFrame
      title="ARTEFATO ORIGINAL PRESERVADO — GitPulse"
      notice="O HTML original permanece intacto; integração Control Center ainda não ativa."
      src="/originals/github-monitor.html"
    />
  );
}
```

Create `app/page.tsx`:

```tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing">
      <p className="eyebrow">MCF CONTROL CENTER</p>
      <h1>Operational cockpit foundation</h1>
      <p>E4 baseline shell. Live integrations remain gated for E5/E6.</p>
      <nav className="route-grid" aria-label="Control Center surfaces">
        <Link href="/mission-control">Mission Control</Link>
        <Link href="/github">GitPulse</Link>
      </nav>
    </main>
  );
}
```

Create `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "MCF Control Center",
  description: "MCF operational cockpit foundation",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
```

Create `app/globals.css`:

```css
:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: #080b10; color: #f4f7fb; }
a { color: inherit; }
.landing { min-height: 100vh; padding: 48px; display: grid; place-content: center; gap: 16px; }
.eyebrow { letter-spacing: .16em; opacity: .7; }
.route-grid { display: grid; grid-template-columns: repeat(2, minmax(180px, 1fr)); gap: 12px; }
.route-grid a { padding: 16px; border: 1px solid #2c3440; border-radius: 12px; text-decoration: none; }
.baseline-shell { height: 100vh; display: grid; grid-template-rows: auto minmax(0, 1fr); }
.baseline-banner { padding: 10px 14px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid #2c3440; background: #111722; }
.baseline-banner span { opacity: .78; }
.baseline-frame { width: 100%; height: 100%; min-height: 0; border: 0; background: #000; }
```
- [ ] **Step 5: Run route tests and typecheck to verify GREEN**

Run:

```bash
npx vitest run tests/routes.test.tsx
npm run typecheck
```

Expected: route tests PASS and TypeScript reports no errors.

- [ ] **Step 6: Re-run artifact hashes after adding the shell**

Run:

```bash
npm run test:artifacts
sha256sum artifacts/originals/workbuddy/*.html public/originals/*.html
```

Expected: approved hashes remain unchanged.

- [ ] **Step 7: Commit the shell routing checkpoint**

```bash
git add package.json package-lock.json tsconfig.json next-env.d.ts next.config.ts vitest.config.ts .gitignore app components tests/routes.test.tsx
git commit -m "feat: add preserved control center web shell"
```

---

### Task 3: Add the non-secret health endpoint and explicit server configuration boundary

**Files:**
- Create: `app/api/health/route.ts`
- Create: `lib/server/env.ts`
- Create: `tests/server-boundary.test.ts`

**Interfaces:**
- Consumes: no secrets and no Supabase client.
- Produces: `GET(): Response`, `ServerConfigurationError`, and `requireServerEnv(name, env?)` for later E5/E6 server modules.

- [ ] **Step 1: Write the failing server-boundary tests**

Create `tests/server-boundary.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("server boundary", () => {
  it("health response is non-secret and identifies baseline shell mode", async () => {
    const { GET } = await import("../app/api/health/route");
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "mcf-control-center",
      mode: "baseline-shell",
    });
  });

  it("missing privileged configuration throws an explicit error", async () => {
    const { requireServerEnv, ServerConfigurationError } = await import("../lib/server/env");
    expect(() => requireServerEnv("SUPABASE_SERVICE_ROLE_KEY", {})).toThrow(ServerConfigurationError);
    expect(() => requireServerEnv("SUPABASE_SERVICE_ROLE_KEY", {})).toThrow(
      "Missing required server configuration: SUPABASE_SERVICE_ROLE_KEY",
    );
  });


  it("required server configuration returns the supplied value without fallback", async () => {
    const { requireServerEnv } = await import("../lib/server/env");
    expect(requireServerEnv("GITHUB_TOKEN", { GITHUB_TOKEN: "test-value" })).toBe("test-value");
  });
});
```

- [ ] **Step 2: Run the server-boundary tests and verify RED**

Run:

```bash
npx vitest run tests/server-boundary.test.ts
```

Expected: FAIL because `app/api/health/route.ts` and/or `lib/server/env.ts` do not exist.

- [ ] **Step 3: Implement the minimal health route**

Create `app/api/health/route.ts`:

```ts
export async function GET() {
  return Response.json({
    status: "ok",
    service: "mcf-control-center",
    mode: "baseline-shell",
  });
}
```

- [ ] **Step 4: Implement the explicit server configuration reader**

Create `lib/server/env.ts`:

```ts
export type ServerEnvName =
  | "SUPABASE_URL"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "GITHUB_TOKEN"
  | "MCF_INGEST_HMAC_SECRET";

export class ServerConfigurationError extends Error {
  constructor(name: ServerEnvName) {
    super(`Missing required server configuration: ${name}`);
    this.name = "ServerConfigurationError";
  }
}

export function requireServerEnv(
  name: ServerEnvName,
  env: Record<string, string | undefined> = process.env,
): string {
  const value = env[name]?.trim();
  if (!value) throw new ServerConfigurationError(name);
  return value;
}
```

Do not import this module from any Client Component.

- [ ] **Step 5: Re-run server-boundary tests and verify GREEN**

Run:

```bash
npx vitest run tests/server-boundary.test.ts
npm run typecheck
```

Expected: all server-boundary tests PASS and TypeScript reports no errors.

- [ ] **Step 6: Commit the server-boundary checkpoint**

```bash
git add app/api/health/route.ts lib/server/env.ts tests/server-boundary.test.ts
git commit -m "feat: add server boundary and health endpoint"
```

---

### Task 4: Enforce the browser/secret boundary

**Files:**
- Create: `.env.example`
- Create: `tests/security-boundary.test.mjs`
- Modify: `.gitignore` only if Task 2 did not already produce the required env rules.

**Interfaces:**
- Consumes: server env names from `lib/server/env.ts`.
- Produces: executable guardrails that block secret-shaped values and privileged env access from browser-facing shell sources.

- [ ] **Step 1: Write the failing security-boundary tests**

Create `tests/security-boundary.test.mjs`:

```js
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
```

- [ ] **Step 2: Run security tests and verify RED**

Run:

```bash
node --test tests/security-boundary.test.mjs
```

Expected: FAIL because `.env.example` does not exist yet. Any other failure must be fixed before proceeding.

- [ ] **Step 3: Add blank-name-only environment documentation**

Create `.env.example` exactly:

```dotenv
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GITHUB_TOKEN=
MCF_INGEST_HMAC_SECRET=
```

Confirm `.gitignore` contains:

```gitignore
node_modules/
.next/
.env*
!.env.example
```

- [ ] **Step 4: Re-run security tests and verify GREEN**

Run:

```bash
node --test tests/security-boundary.test.mjs
npm run test:unit
npm run test:artifacts
```

Expected: all security, unit, and artifact tests PASS.

- [ ] **Step 5: Commit the security-boundary checkpoint**

```bash
git add .env.example .gitignore tests/security-boundary.test.mjs
git commit -m "test: enforce control center secret boundary"
```

---

### Task 5: Prove local production build and browser rendering

**Files:**
- Create: `docs/e4/E4-WEB-SHELL-LOCAL-VALIDATION.md`
- Create: `docs/evidence/e4/WEB-SHELL-MISSION-CONTROL-LOCAL.png`
- Create: `docs/evidence/e4/WEB-SHELL-GITHUB-LOCAL.png`

**Interfaces:**
- Consumes: verified shell from Tasks 1–4.
- Produces: build, HTTP, and visual evidence sufficient to ask LEANDRO for the Vercel deploy HUMAN_GATE.

- [ ] **Step 1: Run the complete automated verification before building**

Run:

```bash
npm test
npm run typecheck
```

Expected: all artifact, route, server-boundary, and security tests PASS; TypeScript reports no errors.

- [ ] **Step 2: Build the production application locally**

Run:

```bash
npm run build
```

Expected: exit code 0; Next.js reports successful production build with `/`, `/mission-control`, `/github`, and `/api/health` available.

- [ ] **Step 3: Start the production server on a fixed local port**

Run in a dedicated terminal session:

```bash
npm run start -- -p 3100
```

Expected: server listens on `http://127.0.0.1:3100` and remains running for smoke verification.

- [ ] **Step 4: Verify HTTP contracts against the production server**

Run:

```bash
curl -fsS http://127.0.0.1:3100/api/health | python3 -m json.tool
curl -fsSI http://127.0.0.1:3100/
curl -fsSI http://127.0.0.1:3100/mission-control
curl -fsSI http://127.0.0.1:3100/github
curl -fsSI http://127.0.0.1:3100/originals/agent-apps-scene.html
curl -fsSI http://127.0.0.1:3100/originals/github-monitor.html
```

Expected health body:

```json
{
  "status": "ok",
  "service": "mcf-control-center",
  "mode": "baseline-shell"
}
```

Expected: every HEAD request returns a 2xx response.

- [ ] **Step 5: Capture browser smoke evidence with existing Google Chrome**

Open `http://127.0.0.1:3100/mission-control` in the authenticated desktop browser and confirm the preserved Mission Control UI is visibly rendered inside the shell banner. Save the window capture exactly as:

`docs/evidence/e4/WEB-SHELL-MISSION-CONTROL-LOCAL.png`

Then open `http://127.0.0.1:3100/github`, confirm the preserved GitPulse UI is visibly rendered inside its shell banner, and save:

`docs/evidence/e4/WEB-SHELL-GITHUB-LOCAL.png`

Do not alter the HTML to make the screenshots look better. The purpose is reproduction evidence, not redesign.

- [ ] **Step 6: Write the local validation receipt from fresh evidence**

Run this after Steps 1–5 have passed:

```bash
MC_HASH=$(sha256sum artifacts/originals/workbuddy/agent-apps-scene.html | awk '{print $1}')
GP_HASH=$(sha256sum artifacts/originals/workbuddy/github-monitor.html | awk '{print $1}')
MC_PUBLIC_HASH=$(sha256sum public/originals/agent-apps-scene.html | awk '{print $1}')
GP_PUBLIC_HASH=$(sha256sum public/originals/github-monitor.html | awk '{print $1}')
CHECKPOINT=$(git rev-parse --short HEAD)
cat > docs/e4/E4-WEB-SHELL-LOCAL-VALIDATION.md <<EOF
# E4 Web Shell — Local Validation

Status: LOCAL_VALIDATION_PASS / VERCEL_DEPLOY_NOT_AUTHORIZED
Checkpoint tested: ${CHECKPOINT}
Local URL: http://127.0.0.1:3100

## Preservation
- Mission Control canonical: ${MC_HASH}
- Mission Control public copy: ${MC_PUBLIC_HASH}
- GitPulse canonical: ${GP_HASH}
- GitPulse public copy: ${GP_PUBLIC_HASH}

## Automated gates
- npm test: PASS
- npm run typecheck: PASS
- npm run build: PASS
- /api/health: PASS
- local route HTTP checks: PASS

## Visual evidence
- docs/evidence/e4/WEB-SHELL-MISSION-CONTROL-LOCAL.png
- docs/evidence/e4/WEB-SHELL-GITHUB-LOCAL.png

## External boundary
No Vercel Deploy action was executed and no public URL was created by this validation.
EOF
```

Verify the four recorded hashes equal the two approved canonical values pairwise.

- [ ] **Step 7: Commit the local-validation evidence**

Run:

```bash
git add docs/e4/E4-WEB-SHELL-LOCAL-VALIDATION.md docs/evidence/e4/WEB-SHELL-MISSION-CONTROL-LOCAL.png docs/evidence/e4/WEB-SHELL-GITHUB-LOCAL.png
git commit -m "test: validate control center shell locally"
```

Stop the local Next.js server after the evidence commit if it is no longer needed.

---

### Task 6: Close the local shell checkpoint and stop at the deploy HUMAN_GATE

**Files:**
- Modify: `docs/MISSION-MCF-CONTROL-CENTER-001.md`
- Modify: `docs/superpowers/specs/2026-09-03-e4-nextjs-control-center-shell-design.md`
- Modify externally after push: GitHub Issue #1 checklist only.

**Interfaces:**
- Consumes: all passing local evidence from Tasks 1–5.
- Produces: a clean pushed checkpoint whose next allowed action is LEANDRO's Vercel deploy decision.

- [ ] **Step 1: Run a fresh final verification before changing status docs**

Run:

```bash
npm test
npm run typecheck
npm run build
sha256sum artifacts/originals/workbuddy/*.html public/originals/*.html
git diff --check
```

Expected: every test/build command exits 0; artifact hashes match the approved pairs; `git diff --check` emits nothing.

- [ ] **Step 2: Update the approved spec status without changing its design**

Change only the status line in `docs/superpowers/specs/2026-09-03-e4-nextjs-control-center-shell-design.md` to:

```text
Status: `LOCAL_IMPLEMENTATION_VALIDATED / VERCEL_DEPLOY_HUMAN_GATE`
```

Change the final implementation-status sentence to:

```text
The approved Next.js shell has passed local implementation validation. External Vercel deployment remains blocked pending a new explicit HUMAN_GATE from LEANDRO.
```

Do not alter architecture, routes, hashes, or acceptance criteria in this step.

- [ ] **Step 3: Update the mission state to the local-validation gate**

In `docs/MISSION-MCF-CONTROL-CENTER-001.md`, update the current-state block so it says:

```text
- Etapa concluída: **E3 — Arquitetura do MCF Control Center**.
- Etapa atual: **E4 — Fundação Vercel + Supabase / shell Next.js validado localmente**.
- Status: **LOCAL_VALIDATION_PASS / AWAITING VERCEL DEPLOY HUMAN_GATE**.
- Pattern B: workspaces isolados por agente + missão, com contexto explícito por handoff.
- Supabase: projeto `mcf-control-center` ativo em `sa-east-1`, ledger mínimo aplicado e validado.
- Web shell: Next.js local com baselines preservados, build/testes/smoke visual aprovados.
- Próximo gate: LEANDRO autorizar ou negar o primeiro deploy/public URL na Vercel.
```

- [ ] **Step 4: Commit the local shell closure**

Run:

```bash
git add docs/MISSION-MCF-CONTROL-CENTER-001.md docs/superpowers/specs/2026-09-03-e4-nextjs-control-center-shell-design.md
git commit -m "docs: close E4 shell local validation"
```

- [ ] **Step 5: Verify the committed checkpoint is clean before push**

Run:

```bash
git status --short
git diff --check HEAD~1..HEAD
npm test
npm run typecheck
npm run build
```

Expected: `git status --short` is empty and all verification commands PASS.

- [ ] **Step 6: Push only after all local gates pass**

Run:

```bash
git push origin mission/mcf-control-center-001
```

Expected: remote branch advances to the verified local shell checkpoint.

- [ ] **Step 7: Update GitHub Issue #1 and stop**

Update Issue #1 so E4 records:

```text
Next.js shell local validation ✅
- artifact preservation hashes PASS
- route/unit/security tests PASS
- local production build PASS
- browser smoke evidence PASS
- Vercel Deploy NOT executed
- public URL NOT created
- next state: AWAITING HUMAN_GATE
```

Then stop execution and present LEANDRO with:

1. final commit SHA;
2. test/build results;
3. two browser evidence images;
4. confirmation that no external Vercel deploy/public URL exists;
5. a binary HUMAN_GATE question: authorize first Vercel deploy, or keep local-only.

Do not interpret prior approvals of the design/spec/plan as deploy authorization.

---

## Plan Self-Review Checklist

- Spec sections 1–15 are covered: preservation (Task 1), routes/shell (Task 2), server boundary/health (Task 3), secrets (Task 4), local verification/browser evidence (Task 5), VPS/deploy boundary/final gate (Task 6).
- No implementation task edits the canonical WorkBuddy HTML files.
- No task adds client-side Supabase access or LIVE labeling.
- No task creates a Vercel public URL.
- Exact dependency versions are pinned; `latest` is not used.
- TDD RED→GREEN cycles exist for artifact preservation, route behavior, server boundary, and security boundary.
- Browser smoke uses the already-installed Chrome rather than downloading another browser runtime.
- The Supabase project ref is metadata only; no key or secret value is embedded in the plan.
- Final execution state is intentionally `AWAITING HUMAN_GATE`, not `E4 complete` and not `deployed`.
