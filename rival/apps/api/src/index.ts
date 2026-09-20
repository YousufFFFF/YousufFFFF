import { assertProductionConfig, config } from './config.ts';
import { closePool } from './db/index.ts';
import { buildServer } from './server.ts';

/** Process entry point: validate config, start listening, shut down cleanly. */

assertProductionConfig();

const app = buildServer();

async function start(): Promise<void> {
  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`RIVAL API listening on ${config.host}:${config.port} (${config.env})`);
  } catch (error) {
    app.log.error({ err: error }, 'failed to start');
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void (async () => {
      app.log.info(`${signal} received, shutting down`);
      await app.close();
      await closePool();
      process.exit(0);
    })();
  });
}

void start();
