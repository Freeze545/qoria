require('dotenv').config();
(async () => {
  const providers = require('../lib/providers');
  const results = await providers.smokeAll();
  console.log(JSON.stringify(results, null, 2));
  const ok = Object.values(results).some((r) => r.connected);
  process.exit(ok ? 0 : 1);
})();
