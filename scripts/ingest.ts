import { runDataIngestion } from "../lib/pocket";

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

function parseIntervalMs(): number {
  const raw = process.env.POCKET_INGEST_INTERVAL_MS;
  if (!raw) return DEFAULT_INTERVAL_MS;

  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_INTERVAL_MS;
}

async function runOnce(): Promise<void> {
  await runDataIngestion();
}

async function runForever(): Promise<void> {
  const intervalMs = parseIntervalMs();

  while (true) {
    const startedAt = Date.now();
    try {
      await runOnce();
    } catch {
      // The ingestion layer already writes the detailed failure to job_runs and stderr.
    }

    const elapsedMs = Date.now() - startedAt;
    await new Promise((resolve) => setTimeout(resolve, Math.max(10_000, intervalMs - elapsedMs)));
  }
}

if (process.argv.includes("--watch")) {
  void runForever();
} else {
  runOnce().catch(() => {
    process.exitCode = 1;
  });
}
