import { createHash, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';

const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const cooldown = 60_000;
const validity = 24 * 60 * 60 * 1000;
const withMessages = (send, transport, from) =>
  Object.assign(send, {
    sendMessage: ({ to, subject, text, messageId }) =>
      transport.sendMail({ from, to: { address: to, name: '' }, subject, text, messageId }),
  });

export function smtpVerification(env = process.env) {
  // The mail sink is enabled only in the disposable test stack.
  if (env.NODE_ENV === 'test' && env.SOTOVOR_TEST_MAIL_SINK === '1') {
    const transport = nodemailer.createTransport({
      host: env.SOTOVOR_SMTP_HOST,
      port: Number(env.SOTOVOR_SMTP_PORT || 1025),
      secure: false,
      ignoreTLS: true,
    });
    return withMessages(
      async (email, token, purpose = 'verification') => {
        const fragment = purpose === 'password' ? 'reset-password' : 'verify-email';
        await transport.sendMail({
          from: 'test@sotovor.invalid',
          to: email,
          subject: fragment,
          text: new URL('/#' + fragment + '=' + token, env.SOTOVOR_PUBLIC_URL).href,
        });
      },
      transport,
      'test@sotovor.invalid',
    );
  }
  const {
    SOTOVOR_SMTP_HOST: host,
    SOTOVOR_SMTP_USER: user,
    SOTOVOR_SMTP_PASSWORD: pass,
    SOTOVOR_SMTP_FROM: from,
    SOTOVOR_PUBLIC_URL: url,
  } = env;
  if (!host && env.SOTOVOR_REQUIRE_SMTP !== '1') return undefined;
  const publicUrl = URL.parse(url ?? '');
  if (
    !host ||
    !user ||
    !pass ||
    !from ||
    publicUrl?.protocol !== 'https:' ||
    publicUrl.href !== publicUrl.origin + '/'
  ) {
    throw new Error(
      'Email verification requires SMTP host, user, password, sender, and a public HTTPS origin.',
    );
  }
  const port = Number(env.SOTOVOR_SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SOTOVOR_SMTP_PORT.');
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: true,
    auth: { user, pass },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
  return withMessages(
    async (email, token, purpose = 'verification') => {
      const reset = purpose === 'password';
      const link = new URL((reset ? '/#reset-password=' : '/#verify-email=') + token, publicUrl);
      const subject = reset
        ? 'Ponastavi geslo za Sotovor / Reset your password'
        : 'Potrdi e-pošto za Sotovor / Verify your email';
      await transport.sendMail({
        from,
        to: { address: email, name: '' },
        subject,
        text:
          subject +
          '\n\n' +
          link.href +
          (reset
            ? '\n\nPovezava velja eno uro. / This link is valid for one hour.'
            : '\n\nPovezava velja 24 ur. / This link is valid for 24 hours.'),
      });
    },
    transport,
    from,
  );
}

export async function sendEmailVerification(accounts, account, send, reportFailure) {
  const now = Date.now();
  const token = randomBytes(32).toString('hex');
  const hash = hashToken(token);
  const result = await accounts.updateOne(
    {
      _id: account._id,
      emailVerifiedAt: null,
      $or: [
        { emailVerification: { $exists: false } },
        { 'emailVerification.sentAt': { $lte: new Date(now - cooldown) } },
      ],
    },
    {
      $set: { emailVerification: { hash, sentAt: new Date(now), expiresAt: new Date(now + validity) } },
    },
  );
  if (!result.modifiedCount) return 'wait';
  try {
    await send(account.email, token);
    return 'sent';
  } catch {
    reportFailure();
    return 'failed';
  }
}

export async function confirmEmailVerification(accounts, token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false;
  const result = await accounts.updateOne(
    {
      emailVerifiedAt: null,
      'emailVerification.hash': hashToken(token),
      'emailVerification.expiresAt': { $gt: new Date() },
    },
    {
      $set: { emailVerifiedAt: new Date() },
      $unset: { emailVerification: '' },
    },
  );
  return Boolean(result.modifiedCount);
}
