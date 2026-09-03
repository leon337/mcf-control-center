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
