import assert from 'node:assert/strict';
import test from 'node:test';
import { envSchema } from './env';

const requiredEnv = {
  DATABASE_URL: 'postgresql://cse_user:cse_password@postgres:5432/cse_research'
};

test('env parser treats string false as false for Docker boolean values', () => {
  const parsed = envSchema.parse({
    ...requiredEnv,
    RUN_MIGRATIONS_ON_START: 'false',
    MINIO_USE_SSL: 'false',
    CSE_MOCK_MODE: 'false',
    CSE_IMPORT_ALLOW_UNPROTECTED_MANUAL_RUN: 'false',
    CSE_IMPORT_SCHEDULER_ENABLED: 'false',
    CSE_IMPORT_WEEKDAYS_ONLY: 'false',
    CSE_TRADE_SUMMARY_ENABLED: 'true',
    CSE_TRADE_SUMMARY_SCHEDULER_ENABLED: 'false',
    CSE_TRADE_SUMMARY_WEEKDAYS_ONLY: 'false'
  });

  assert.equal(parsed.RUN_MIGRATIONS_ON_START, false);
  assert.equal(parsed.MINIO_USE_SSL, false);
  assert.equal(parsed.CSE_MOCK_MODE, false);
  assert.equal(parsed.CSE_IMPORT_ALLOW_UNPROTECTED_MANUAL_RUN, false);
  assert.equal(parsed.CSE_IMPORT_SCHEDULER_ENABLED, false);
  assert.equal(parsed.CSE_IMPORT_WEEKDAYS_ONLY, false);
  assert.equal(parsed.CSE_TRADE_SUMMARY_ENABLED, true);
  assert.equal(parsed.CSE_TRADE_SUMMARY_SCHEDULER_ENABLED, false);
  assert.equal(parsed.CSE_TRADE_SUMMARY_WEEKDAYS_ONLY, false);
});

test('env parser accepts common true strings for Docker boolean values', () => {
  const parsed = envSchema.parse({
    ...requiredEnv,
    RUN_MIGRATIONS_ON_START: 'true',
    MINIO_USE_SSL: '1',
    CSE_IMPORT_WEEKDAYS_ONLY: 'on',
    CSE_TRADE_SUMMARY_SCHEDULER_ENABLED: 'yes'
  });

  assert.equal(parsed.RUN_MIGRATIONS_ON_START, true);
  assert.equal(parsed.MINIO_USE_SSL, true);
  assert.equal(parsed.CSE_IMPORT_WEEKDAYS_ONLY, true);
  assert.equal(parsed.CSE_TRADE_SUMMARY_SCHEDULER_ENABLED, true);
});
