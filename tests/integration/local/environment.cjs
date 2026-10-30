// Called before loading the database, application or external-service clients.
function configureLocalIntegration(env = process.env) {
  if (env.NODE_ENV !== 'test') {
    throw new Error('Local integration tests require NODE_ENV=test; never run them on the VPS.');
  }
  if (!env.AURIUM_TEST_DATABASE_URL) {
    throw new Error('Set AURIUM_TEST_DATABASE_URL explicitly; the server DATABASE_URL is not used.');
  }
  if (env.DOTENV_CONFIG_OVERRIDE) {
    throw new Error('Local integration tests forbid dotenv overrides of the validated fixture settings.');
  }
  let url;
  try { url = new URL(env.AURIUM_TEST_DATABASE_URL); }
  catch { throw new Error('AURIUM_TEST_DATABASE_URL must be a valid local PostgreSQL URL.'); }
  const options = [...url.searchParams];
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['localhost', '127.0.0.1'].includes(url.hostname)
      || url.port !== '51218' || url.pathname !== '/template1' || url.hash
      || options.length > 1 || options.some(([key, value]) => key !== 'sslmode' || value !== 'disable')) {
    throw new Error('Only the local fixture database at localhost:51218/template1 is allowed, with optional sslmode=disable.');
  }
  // Use dummy service settings even if the launching shell has normal app settings.
  Object.assign(env, {
    DATABASE_URL: url.href, JWT_SAUCE: 'local-integration-only',
    FRONTEND_ORIGIN: 'http://localhost:3021', SENTRY_DSN: '',
    RESEND_API: 're_local_test_only', R2_BUCKET: 'aurium-review-local',
    R2_ACC_ID: 'local-test-only', R2_ACC_KEY: 'local-test-only', R2_SECRET_KEY: 'local-test-only',
  });
  return url;
}
module.exports = { configureLocalIntegration };
