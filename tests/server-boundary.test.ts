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
