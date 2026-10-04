import type { AdminApi } from './adminTypes';
import { createAdminDemo } from './adminDemo';
import { createAdminNetlify } from './adminNetlify';
import { DEMO } from './index';

export const adminApi: AdminApi = DEMO ? createAdminDemo() : createAdminNetlify();
