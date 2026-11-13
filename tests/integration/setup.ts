import "dotenv/config";

// The wrapper script passes the isolated test database explicitly. Falling
// back here is intentionally allowed only when TEST_DATABASE_URL is present;
// otherwise the suite would silently write fixtures into the development DB.
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required. Run `npm run test:integration`, which creates and migrates an isolated *_test database.",
  );
}

if (!new URL(testDatabaseUrl).pathname.endsWith("_test")) {
  throw new Error(
    "Refusing to run integration tests against a database whose name does not end in _test.",
  );
}

process.env.DATABASE_URL = testDatabaseUrl;
