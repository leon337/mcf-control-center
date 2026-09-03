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
