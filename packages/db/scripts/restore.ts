import { spawn } from "node:child_process";

const input = process.argv[2];

if (!input) {
  throw new Error("Usage: pnpm db:restore <backup.sql>");
}

const child = spawn(
  "psql",
  [process.env.DATABASE_URL ?? "", "--set", "ON_ERROR_STOP=on", "-f", input],
  { stdio: "inherit" },
);

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
