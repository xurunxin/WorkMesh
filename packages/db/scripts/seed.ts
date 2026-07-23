import { fileURLToPath } from "node:url";
import { createDb, installWorkspace } from "../src/index.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SeedAdminCredentials = { email: string; password: string };

/** Resolve explicit seed credentials before opening a database connection. */
export const resolveSeedAdminCredentials = (
  env: NodeJS.ProcessEnv = process.env,
): SeedAdminCredentials => {
  const email = env.SEED_ADMIN_EMAIL?.trim();
  const password = env.SEED_ADMIN_PASSWORD;
  if (!email || !password)
    throw new Error(
      "SEED_ADMIN_CREDENTIALS_REQUIRED: set both SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD",
    );
  if (!emailPattern.test(email)) throw new Error("SEED_ADMIN_EMAIL_INVALID");
  if (password.length < 12)
    throw new Error(
      "SEED_ADMIN_PASSWORD_TOO_SHORT: use at least 12 characters",
    );
  return { email, password };
};

const run = async (): Promise<void> => {
  const credentials = resolveSeedAdminCredentials();
  const db = createDb();
  try {
    await installWorkspace(db, {
      workspaceName: "WorkMesh",
      workspaceSlug: "workmesh",
      adminName: "Admin",
      ...credentials,
    });
    console.log("seeded");
  } catch (error) {
    if ((error as Error).message !== "INSTALLATION_ALREADY_COMPLETED")
      throw error;
    console.log("already installed");
  } finally {
    await db.end();
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  await run();
