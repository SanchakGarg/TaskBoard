const required = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
};

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/taskboard",
  jwtSecret: process.env.JWT_SECRET ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  isProd: process.env.NODE_ENV === "production",
  encryptionKey: process.env.ENCRYPTION_KEY ?? "",
  sheetsSyncEnabled: process.env.ENABLE_SHEETS_SYNC !== "false", // Default to true if not set

  auth: {
    guest: {
      enabled: process.env.AUTH_GUEST_ENABLED === "true",
    },
    google: {
      enabled: process.env.AUTH_GOOGLE_ENABLED === "true",
      get clientId() {
        return required("GOOGLE_CLIENT_ID");
      },
      get clientSecret() {
        return required("GOOGLE_CLIENT_SECRET");
      },
      issuer: "https://accounts.google.com",
    },
    zitadel: {
      enabled: process.env.AUTH_ZITADEL_ENABLED === "true",
      get clientId() {
        return required("ZITADEL_CLIENT_ID");
      },
      get clientSecret() {
        return required("ZITADEL_CLIENT_SECRET");
      },
      get issuer() {
        return required("ZITADEL_ISSUER");
      },
    },
  },
};

if (!config.jwtSecret) {
  if (config.isProd) throw new Error("JWT_SECRET must be set in production");
  config.jwtSecret = "dev-only-secret-do-not-use-in-prod";
}

if (!config.encryptionKey) {
  if (config.isProd) throw new Error("ENCRYPTION_KEY must be set in production");
  config.encryptionKey = "dev-only-encryption-key-32-chars-!!!";
}
