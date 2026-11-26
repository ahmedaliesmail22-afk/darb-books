import { loadEnv } from './env';
import { buildServer } from './server';

async function main(): Promise<void> {
  const env = loadEnv();
  const { app } = await buildServer({ env, logger: env.NODE_ENV !== 'test' });
  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err) => {
  console.error('Failed to start @darb/api:', err);
  process.exit(1);
});
