import nodemailer from 'nodemailer';
import { config } from '../config.js';

// Every email here is free of patient information (NFR-3): only the user's
// name, a code or a link to sign in.

let cachedTransporter = null;

export function createTransporter() {
  const smtp = config.smtp;
  const isGmail =
    smtp.service === 'gmail' ||
    (smtp.host && smtp.host.toLowerCase().includes('gmail')) ||
    (smtp.user && smtp.user.toLowerCase().includes('@gmail.com'));

  if (isGmail && smtp.user && smtp.pass) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: smtp.user.trim(),
        // Google app passwords are 16 letters, often copied with spaces: strip spaces
        pass: smtp.pass.replace(/\s+/g, ''),
      },
    });
  }

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user.trim(), pass: smtp.pass.trim() } : undefined,
  });
}

export function getTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = createTransporter();
  }
  return cachedTransporter;
}

export async function verifyConnection() {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    return { ok: true, message: 'SMTP connection verified successfully.' };
  } catch (err) {
    return { ok: false, message: err.message, code: err.code };
  }
}

async function send({ to, subject, text, html }) {
  if (config.devLogEmail) {
    console.log(`\n[mail:dev] To: ${to}\n[mail:dev] Subject: ${subject}\n${text}\n`);
  }
  try {
    const transporter = createTransporter();
    const from = config.mailFrom || (config.smtp.user ? `My Patient <${config.smtp.user}>` : undefined);
    const info = await transporter.sendMail({ from, to, subject, text, html });
    console.log(`[mail] Email successfully sent to ${to} (Message ID: ${info.messageId})`);
    return true;
  } catch (err) {
    console.error(`[mail] Failed to send email to ${to}:`, err.message || err.code || err);
    // In development or if dev logging is enabled, the console copy is enough to continue.
    return config.devLogEmail;
  }
}

const footerText = '\n\n— US24 Solutions · My Patient\nIf you did not expect this email, you can safely ignore it.';

function emailWrapper(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f6fa; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(37, 59, 128, 0.06);" cellspacing="0" cellpadding="0">
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #253B80; padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: -0.01em;">My Patient</h1>
              <p style="margin: 4px 0 0 0; color: rgba(255, 255, 255, 0.85); font-size: 13px;">US24 Solutions Statement Portal</p>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 28px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5;">
              © ${new Date().getFullYear()} US24 Solutions · My Patient Portal · HIPAA Compliant<br>
              If you did not request this email, please disregard it.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export const mail = {
  otpCode: (to, name, code) => {
    const text = `Hello ${name},\n\nYour sign-in code is: ${code}\n\nIt expires in ${config.session.otpMinutes} minutes and can be used once.${footerText}`;
    const html = emailWrapper(
      'Your My Patient sign-in code',
      `
      <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Hello ${name},</h2>
      <p style="margin: 0 0 20px 0; color: #475569; font-size: 14px; line-height: 1.5;">
        Use the following one-time code to sign in to your My Patient account:
      </p>
      <div style="background-color: #f0f4ff; border: 2px dashed #253B80; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0;">
        <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #253B80;">${code}</span>
      </div>
      <p style="margin: 0; color: #64748b; font-size: 13px; line-height: 1.5;">
        ⏱️ This code will expire in <strong>${config.session.otpMinutes} minutes</strong> and can only be used once.<br>
        🔒 For your security, never share this code with anyone.
      </p>
      `
    );
    return send({ to, subject: 'Your My Patient sign-in code', text, html });
  },

  invitation: (to, name, link) => {
    const text = `Hello ${name},\n\nUS24 Solutions has created a My Patient account for you. Set your password here:\n\n${link}\n\nThis link expires in ${config.tokens.inviteHours} hours.${footerText}`;
    const html = emailWrapper(
      "You've been invited to My Patient",
      `
      <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Hello ${name},</h2>
      <p style="margin: 0 0 24px 0; color: #475569; font-size: 14px; line-height: 1.5;">
        US24 Solutions has created a My Patient account for you. Click the button below to set your password and activate your account:
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${link}" style="display: inline-block; background-color: #F36C21; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 12px 28px; border-radius: 6px;">Set your password</a>
      </div>
      <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.5;">
        This link expires in ${config.tokens.inviteHours} hours.<br>
        If the button above does not work, copy and paste this link into your browser:<br>
        <a href="${link}" style="color: #253B80; word-break: break-all;">${link}</a>
      </p>
      `
    );
    return send({ to, subject: "You've been invited to My Patient", text, html });
  },

  passwordReset: (to, name, link) => {
    const text = `Hello ${name},\n\nUse this link to set a new password:\n\n${link}\n\nThis link expires in ${config.tokens.resetMinutes} minutes and can be used once.${footerText}`;
    const html = emailWrapper(
      'Reset your My Patient password',
      `
      <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Hello ${name},</h2>
      <p style="margin: 0 0 24px 0; color: #475569; font-size: 14px; line-height: 1.5;">
        We received a request to reset your My Patient password. Click below to choose a new password:
      </p>
      <div style="text-align: center; margin: 28px 0;">
        <a href="${link}" style="display: inline-block; background-color: #253B80; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 12px 28px; border-radius: 6px;">Reset password</a>
      </div>
      <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.5;">
        This link expires in ${config.tokens.resetMinutes} minutes and can be used once.<br>
        If the button above does not work, copy and paste this link into your browser:<br>
        <a href="${link}" style="color: #253B80; word-break: break-all;">${link}</a>
      </p>
      `
    );
    return send({ to, subject: 'Reset your My Patient password', text, html });
  },
};
