import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  BOT_TOKEN: requireEnv("BOT_TOKEN"),
  STRUCT_API_KEY: requireEnv("STRUCT_API_KEY"),
} as const;
