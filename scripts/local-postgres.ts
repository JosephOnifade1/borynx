import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { escapeIdentifier } from "pg";

export const LOOPBACK = "127.0.0.1";

export function freeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer().once("error", reject).listen(0, LOOPBACK, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local TCP port"));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

/** This helper never reads DATABASE_URL or connects to an existing cluster. */
export async function withLocalPostgres<T>(run: (pg: { directory: string; createDatabase: (name: string) => Promise<string> }) => Promise<T>): Promise<T> {
  if (process.getuid?.() === 0) throw new Error("Run the disposable PostgreSQL scripts as a normal user, not root.");
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const port = await freeLoopbackPort();
  const directory = await mkdtemp(join(tmpdir(), "borynx-pg-"));
  const password = randomBytes(24).toString("hex");
  const pg = new EmbeddedPostgres({
    databaseDir: join(directory, "pgdata"),
    user: "postgres",
    password,
    port,
    authMethod: "scram-sha-256",
    persistent: false,
    initdbFlags: ["--locale=C", "--encoding=UTF8"],
    postgresFlags: ["-h", LOOPBACK, "-c", "unix_socket_directories="],
    onLog: (message) => { if (/FATAL|PANIC/i.test(message)) process.stderr.write(message); },
  });
  let started = false;
  try {
    await pg.initialise();
    await pg.start();
    started = true;
    const createDatabase = async (name: string) => {
      const client = pg.getPgClient("postgres", LOOPBACK);
      await client.connect();
      try {
        await client.query(`create database ${escapeIdentifier(name)}`);
      } finally {
        await client.end();
      }
      return `postgresql://postgres:${password}@${LOOPBACK}:${port}/${name}`;
    };
    return await run({ directory, createDatabase });
  } finally {
    if (started) await pg.stop();
    await rm(directory, { recursive: true, force: true });
  }
}
