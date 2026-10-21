import nodemailer from 'nodemailer';
import { config } from '../config.js';

// Every email here is free of patient information (NFR-3): only the user's
// name, a code or a link to sign in.

const transport = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
});

async function send({ to, subject, text }) {
  if (config.devLogEmail) {
    console.log(`\n[mail:dev] To: ${to}\n[mail:dev] Subject: ${subject}\n${text}\n`);
  }
  try {
    await transport.sendMail({ from: config.mailFrom, to, subject, text });
    return true;
  } catch (err) {
    console.error('[mail] send failed', err.code || err.name);
    // In development the console copy above is enough to continue.
    return config.devLogEmail;
  }
}

const footer = '\n\n— US24 Solutions · My Patient\nIf you did not expect this email, you can ignore it.';

export const mail = {
  otpCode: (to, name, code) =>
    send({
      to,
      subject: 'Your My Patient sign-in code',
      text: `Hello ${name},\n\nYour sign-in code is: ${code}\n\nIt expires in ${config.session.otpMinutes} minutes and can be used once.${footer}`,
    }),

  invitation: (to, name, link) =>
    send({
      to,
      subject: "You've been invited to My Patient",
      text: `Hello ${name},\n\nUS24 Solutions has created a My Patient account for you. Set your password here:\n\n${link}\n\nThis link expires in ${config.tokens.inviteHours} hours.${footer}`,
    }),

  passwordReset: (to, name, link) =>
    send({
      to,
      subject: 'Reset your My Patient password',
      text: `Hello ${name},\n\nUse this link to set a new password:\n\n${link}\n\nThis link expires in ${config.tokens.resetMinutes} minutes and can be used once.${footer}`,
    }),
};
