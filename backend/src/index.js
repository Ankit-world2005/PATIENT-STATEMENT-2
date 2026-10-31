import { config } from './config.js';
import { createApp } from './app.js';
import { runCleanup } from './services/cleanup.js';

const app = createApp();
app.listen(config.port, () => {
  console.log(`[api] My Patient API listening on http://localhost:${config.port}`);
  if (config.devLogEmail) console.log('[api] DEV_LOG_EMAIL is on: sign-in codes and links are also printed here.');
  runCleanup({ force: true });
});
