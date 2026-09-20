import { local } from './local-env.mjs';
process.env.SUPABASE_URL = local.API_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = local.SERVICE_ROLE_KEY;
await import('../apps/worker/src/index');
