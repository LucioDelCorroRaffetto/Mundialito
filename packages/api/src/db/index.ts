import { drizzle } from 'drizzle-orm/libsql';
import { libsqlClient } from './client.js';
import * as schema from './schema/index.js';

export const db = drizzle(libsqlClient, { schema });
