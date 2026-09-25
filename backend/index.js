import config from './src/config/env.js';
import app from './src/app.js';
import prisma from './src/config/db.js';
import { startIndexer } from './src/services/indexer.service.js';

const server = app.listen(config.port, () => {
  console.log(`TrustChain backend listening on port ${config.port} (${config.port === 4000 ? 'dev' : 'prod'})`);

  // Start on-chain event indexer after HTTP server is ready
  startIndexer().catch((err) =>
    console.warn(`[Indexer] Startup error (non-fatal): ${err.message}`)
  );

  // With no ADMIN and no bootstrap allow-list, nobody can approve registrations.
  if (prisma && config.adminWallets.length === 0) {
    prisma.user
      .count({ where: { role: 'ADMIN' } })
      .then((admins) => {
        if (admins === 0) {
          console.warn('No ADMIN identity exists and ADMIN_WALLETS is empty — set ADMIN_WALLETS so the first admin can register.');
        }
      })
      .catch(() => {});
  }
});

export default server;
