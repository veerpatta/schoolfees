import "server-only";

import {
  getSystemSyncHealth,
  type DatabaseObjectStatus,
  type DatabaseObjectStatusKey,
  type RequiredDatabaseObjectsStatus,
  type SystemSyncHealth,
} from "@/modules/system-sync/data/financial-sync";

export type LiveDataHealth = SystemSyncHealth;
export type { DatabaseObjectStatus, DatabaseObjectStatusKey, RequiredDatabaseObjectsStatus };

export async function getLiveDataHealth(sessionLabel?: string): Promise<LiveDataHealth> {
  return getSystemSyncHealth(sessionLabel);
}
