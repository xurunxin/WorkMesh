import { defineConfig } from "@playwright/test";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.RUN_INTEGRATION !== "1" || !databaseUrl) {
  throw new Error(
    "Playwright acceptance tests require RUN_INTEGRATION=1 and DATABASE_URL pointing at a dedicated test database.",
  );
}

const databaseName = new URL(databaseUrl).pathname.slice(1);
if (!/(^|[_-])test(?:[_-]|$)/i.test(databaseName)) {
  throw new Error(
    `Refusing to run destructive Playwright tests against non-test database "${databaseName}".`,
  );
}

const apiPort = "3101";
const webPort = "3100";
const webUrl = `http://127.0.0.1:${webPort}`;
const apiUrl = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  testDir: "./apps/web/e2e",
  globalSetup: "./apps/web/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: webUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @workmesh/api exec tsx src/server.ts",
      url: `${apiUrl}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        SESSION_SECRET:
          process.env.SESSION_SECRET ??
          "acceptance-test-session-secret-0123456789",
        WEB_ORIGIN: webUrl,
        API_PORT: apiPort,
      },
    },
    {
      command: `pnpm --dir apps/web exec next dev --port ${webPort}`,
      url: webUrl,
      reuseExistingServer: false,
      timeout: 90_000,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, NEXT_PUBLIC_API_URL: apiUrl },
    },
  ],
});
