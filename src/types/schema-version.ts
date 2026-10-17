/** Canonical app data schema version. Bump only with a documented migration. */
export const DATA_SCHEMA_VERSION = 1 as const;

export type DataSchemaVersion = typeof DATA_SCHEMA_VERSION;
