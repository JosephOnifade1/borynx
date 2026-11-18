import { startLocalNext } from "./local-next";
import { LOOPBACK, withLocalPostgres } from "./local-postgres";

// A shell's PGSSLMODE/PGOPTIONS must not change the disposable cluster connection.
for (const key of Object.keys(process.env)) if (key.startsWith("PG")) delete process.env[key];

withLocalPostgres(async ({ createDatabase }) => {
  const url = await createDatabase("borynx_demo");
  console.log("Disposable PostgreSQL ready. Use /login to choose a fictional test account. Data is cleared on normal shutdown.");
  const args = process.argv.slice(2);
  if (!args.some((arg) => arg === "--hostname" || arg === "-H" || arg.startsWith("--hostname=") || arg.startsWith("-H="))) {
    args.unshift("--hostname", LOOPBACK);
  }
  const app = startLocalNext(url, "personas", args, true);
  const stop = () => { void app.stop(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    const code = await app.exited;
    if (code) process.exitCode = code;
    if (app.logs) console.error(app.logs);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}).catch((error) => { console.error(error); process.exitCode = 1; });
