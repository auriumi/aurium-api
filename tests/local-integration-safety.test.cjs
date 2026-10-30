const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { configureLocalIntegration } = require('./integration/local/environment.cjs');
const localUrl = 'postgresql://fixture:fixture@127.0.0.1:51218/template1';

test('integration tests require test mode and a separate explicit database URL', () => {
  for (const NODE_ENV of [undefined, 'development', 'production']) {
    assert.throws(() => configureLocalIntegration({ NODE_ENV, AURIUM_TEST_DATABASE_URL: localUrl }), /NODE_ENV=test/);
  }
  assert.throws(() => configureLocalIntegration({ NODE_ENV: 'test', DATABASE_URL: localUrl }), /AURIUM_TEST_DATABASE_URL explicitly/);
  assert.throws(() => configureLocalIntegration({ NODE_ENV: 'test', AURIUM_TEST_DATABASE_URL: localUrl,
    DOTENV_CONFIG_OVERRIDE: 'true' }), /forbid dotenv overrides/);
});

test('integration tests reject remote databases, default server ports and connection overrides', () => {
  for (const url of [
    'not a URL', 'postgresql://fixture:fixture@db.example.invalid:51218/template1',
    localUrl.replace(':51218', ':5432'), localUrl.replace('/template1', '/aurium'),
    localUrl.replace('postgresql:', 'https:'), `${localUrl}?host=db.example.invalid`,
    `${localUrl}?port=5432`, `${localUrl}?dbname=aurium`, `${localUrl}#options`,
    `${localUrl}?sslmode=disable&host=db.example.invalid`, `${localUrl}?sslmode=require`,
  ]) {
    const env = { NODE_ENV: 'test', AURIUM_TEST_DATABASE_URL: url, DATABASE_URL: 'unchanged' };
    assert.throws(() => configureLocalIntegration(env), /local/i);
    assert.equal(env.DATABASE_URL, 'unchanged');
  }
});

test('valid local setup replaces inherited database and external-service settings with fixtures', () => {
  for (const url of [localUrl, localUrl.replace('127.0.0.1', 'localhost'), `${localUrl}?sslmode=disable`]) {
    const env = { NODE_ENV: 'test', AURIUM_TEST_DATABASE_URL: url, DATABASE_URL: 'server-url',
      JWT_SAUCE: 'server-secret', SENTRY_DSN: 'server-dsn', R2_SECRET_KEY: 'server-key' };
    assert.equal(configureLocalIntegration(env).href, url);
    assert.equal(env.DATABASE_URL, url);
    assert.equal(env.SENTRY_DSN, '');
    assert.equal(env.R2_SECRET_KEY, 'local-test-only');
    assert.equal(env.JWT_SAUCE, 'local-integration-only');
  }
});

test('both integration entry points refuse unsafe setup before loading any database or application module', () => {
  for (const filename of ['daily-targets.cjs', 'daily-target-schema.cjs']) {
    const source = readFileSync(join(__dirname, 'integration/local', filename), 'utf8');
    for (const env of [{ NODE_ENV: 'production', AURIUM_TEST_DATABASE_URL: localUrl }, { NODE_ENV: 'test', DATABASE_URL: localUrl }]) {
      assert.throws(() => vm.runInNewContext(source, {
        require(name) {
          assert.equal(name, './environment.cjs', 'Guard must run before other module imports');
          return { configureLocalIntegration: () => configureLocalIntegration(env) };
        },
      }), /NODE_ENV=test|AURIUM_TEST_DATABASE_URL explicitly/);
    }
  }
});
