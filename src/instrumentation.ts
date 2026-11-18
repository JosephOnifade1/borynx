/** Finish the initial database bootstrap before Next serves queries from child pages. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { ensureDatabase } = await import("./db/bootstrap");
  await ensureDatabase();
}
