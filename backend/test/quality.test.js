import assert from 'node:assert/strict';
import { test } from 'node:test';
import { smtpVerification } from '../src/email-verification.js';

test('the disposable mail sink cannot bypass production SMTP validation', () => {
  assert.equal(smtpVerification({ NODE_ENV: 'production', SOTOVOR_TEST_MAIL_SINK: '1' }), undefined);
  assert.throws(() =>
    smtpVerification({
      NODE_ENV: 'production',
      SOTOVOR_TEST_MAIL_SINK: '1',
      SOTOVOR_SMTP_HOST: 'mail',
      SOTOVOR_PUBLIC_URL: 'http://localhost',
    }),
  );
  assert.equal(
    typeof smtpVerification({
      NODE_ENV: 'test',
      SOTOVOR_TEST_MAIL_SINK: '1',
      SOTOVOR_SMTP_HOST: 'mail',
      SOTOVOR_SMTP_PORT: '1025',
      SOTOVOR_PUBLIC_URL: 'http://localhost',
    }),
    'function',
  );
});
