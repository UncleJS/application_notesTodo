/**
 * Runs before any test file (bunfig [test] preload). Points the app's DB pool
 * at the dedicated test database BEFORE db/client.ts is imported anywhere.
 * Pool creation is lazy (no connection until first query), so this is safe
 * even when the test DB hasn't been provisioned yet — ensureTestDb() does that.
 */
process.env.DB_NAME = process.env.TEST_DB_NAME ?? "notestodo_test";
