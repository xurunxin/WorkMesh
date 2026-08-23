import { defineConfig } from "@playwright/test";
import path from "node:path";

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
const bootstrapToken = process.env.WORKMESH_BOOTSTRAP_TOKEN;
const configuredRunRoot = process.env.WORKMESH_PLAYWRIGHT_RUN_DIR?.trim();
if (configuredRunRoot && !path.isAbsolute(configuredRunRoot)) {
  throw new Error("WORKMESH_PLAYWRIGHT_RUN_DIR must be an absolute path");
}
const rootTopologyDirectory = configuredRunRoot
  ? path.join(path.normalize(configuredRunRoot), "root-mixed")
  : process.cwd();
const runPaths = {
  authenticatedStatePath: configuredRunRoot
    ? path.join(rootTopologyDirectory, ".auth", "admin.json")
    : path.join(rootTopologyDirectory, "test-results", ".auth", "admin.json"),
  outputDirectory: configuredRunRoot
    ? path.join(rootTopologyDirectory, "output")
    : path.join(rootTopologyDirectory, "test-results"),
  htmlReportDirectory: configuredRunRoot
    ? path.join(rootTopologyDirectory, "html-report")
    : path.join(rootTopologyDirectory, "playwright-report"),
};
const authenticatedStatePath = runPaths.authenticatedStatePath;
const mockedSpecPattern = /[\\/]mocked[\\/].*\.mocked\.spec\.ts$/;
const vitestFilePattern = /\.test\.tsx?$/;
if (!bootstrapToken) {
  throw new Error(
    "Playwright acceptance tests require an explicit WORKMESH_BOOTSTRAP_TOKEN test fixture.",
  );
}

export default defineConfig({
  testDir: "./apps/web/e2e",
  testIgnore: [mockedSpecPattern, vitestFilePattern],
  globalSetup: "./apps/web/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: runPaths.outputDirectory,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: runPaths.htmlReportDirectory }],
  ],
  projects: [
    {
      name: "bootstrap",
      testMatch: /(stage0|theme-unification)\.spec\.ts/,
    },
    {
      name: "authenticated",
      dependencies: ["bootstrap"],
      testIgnore: [
        /stage0\.spec\.ts/,
        /frontend-unification\.spec\.ts/,
        mockedSpecPattern,
        vitestFilePattern,
      ],
      use: { storageState: authenticatedStatePath },
    },
  ],
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
        WORKMESH_BOOTSTRAP_TOKEN: bootstrapToken,
        WEB_ORIGIN: webUrl,
        API_PORT: apiPort,
        // Acceptance starts API + Web without the outbox worker that normally
        // publishes Redis wake hints, so keep the durable PostgreSQL reconcile
        // inside Playwright's cross-page assertion window.
        REALTIME_HEALTHY_RECONCILE_MS: "1000",
        WORKMESH_BETA_PLANNING: "true",
        WORKMESH_BETA_TEMPLATES: "true",
        WORKMESH_BETA_COSTS: "true",
        WORKMESH_BETA_GITEA: "true",
        WORKMESH_BETA_OPERATIONS_UI: "true",
        WORKMESH_EXPERIMENTAL_AUTOMATION: "true",
        WORKMESH_EXPERIMENTAL_AGENT_LOOPS: "true",
        WORKMESH_EXPERIMENTAL_A2A: "true",
        WORKMESH_EXPERIMENTAL_EXTERNAL_WEBHOOKS: "true",
        WORKMESH_EXPERIMENTAL_MULTI_RUNTIME: "true",
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
