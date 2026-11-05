import nodemailer from 'nodemailer';
import { config } from '../config.js';

// Every email here is designed following the official US24 Solutions branding
// and patient portal communication layout.

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
    const from = config.mailFrom || (config.smtp.user ? `US24 Solutions <${config.smtp.user}>` : undefined);
    const info = await transporter.sendMail({ from, to, subject, text, html });
    console.log(`[mail] Email successfully sent to ${to} (Message ID: ${info.messageId})`);
    return true;
  } catch (err) {
    console.error(`[mail] Failed to send email to ${to}:`, err.message || err.code || err);
    // In development or if dev logging is enabled, the console copy is enough to continue.
    return config.devLogEmail;
  }
}

const footerText = '\n\n— © 2026 US24 Solutions.\nIf you did not expect this email, you can safely ignore it.';

const LOGO_URL = 'https://us24solutions.com/wp-content/uploads/2022/09/us-24-copyq-2-min-1-e1664550612654.png';

/**
 * Standard branded HTML Email layout matching the US24 portal reference design.
 * Features:
 * - Header banner with medical gradient backdrop & official US24 logo
 * - Centered bold uppercase clinic title (MY CLINIC)
 * - Dedicated greeting
 * - Clear body content
 * - Side-by-side Dark pill Action button + Expiry notice
 * - Fallback direct portal link
 * - Dark high-contrast footer with © 2026 US24 Solutions, navigation links, and hallmark star icon
 */
export function emailWrapper(optsOrTitle, legacyBodyHtml) {
  let opts = {};
  if (typeof optsOrTitle === 'string') {
    opts = {
      title: optsOrTitle,
      clinicName: 'MY CLINIC',
      recipientGreeting: '',
      bodyText: '',
      extraHtml: legacyBodyHtml,
    };
  } else {
    opts = optsOrTitle || {};
  }

  const title = opts.title || 'Notification';
  const clinicName = (opts.clinicName || 'MY CLINIC').toUpperCase();
  const recipientGreeting = opts.recipientGreeting || (opts.name ? `Dear ${opts.name},` : 'Dear Valued Patient,');
  const bodyText = opts.bodyText || '';
  const button = opts.button || null; // { label: 'Access<br>Statement', url: '...', expiryText: '...' }
  const extraHtml = opts.extraHtml || '';
  const fallbackNote = opts.fallbackNote || (button?.url ? 'Alternately, you can use the secure portal link below to complete your action.' : '');
  const fallbackUrl = opts.fallbackUrl || button?.url || '';
  const currentYear = new Date().getFullYear();
  const helpUrl = opts.helpUrl || `${config.appUrl}/contact-us24`;
  const termsUrl = opts.termsUrl || `${config.appUrl}/privacy`;
  const privacyUrl = opts.privacyUrl || `${config.appUrl}/privacy`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #eef3f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #eef3f7; padding: 36px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 18px rgba(15, 23, 42, 0.08); border: 1px solid #dce4ec;" cellspacing="0" cellpadding="0" border="0">
          
          <!-- Header Banner with Medical Theme -->
          <tr>
            <td style="background: linear-gradient(135deg, #d3ebf6 0%, #eaf4f9 55%, #d8edf7 100%); padding: 26px 32px; border-bottom: 3px solid #b9dff0;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="left" style="vertical-align: middle;">
                    <!-- US24 Official Logo -->
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="vertical-align: middle;">
                          <img src="${LOGO_URL}" alt="US24" height="38" style="display: block; border: 0; max-height: 38px; width: auto;" />
                        </td>
                        <!-- Text fallback if images are blocked -->
                        <td style="vertical-align: middle; padding-left: 4px;">
                          <!--[if !mso]><!-->
                          <span style="font-family: Arial, Helvetica, sans-serif; font-size: 32px; font-weight: 900; letter-spacing: -1px; line-height: 1; display: none;">
                            <span style="color: #153e75;">US</span><span style="color: #f36c21;">24</span>
                          </span>
                          <!--<![endif]-->
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content Area -->
          <tr>
            <td style="padding: 34px 32px 28px 32px; background-color: #ffffff;">
              <!-- Clinic Name Heading (Centered) -->
              <h1 style="margin: 0 0 12px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 24px; font-weight: 800; color: #1e3a8a; letter-spacing: 0.5px; text-transform: uppercase; text-align: center;">
                ${clinicName}
              </h1>

              <!-- Greeting -->
              ${recipientGreeting ? `
              <p style="margin: 0 0 22px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 500; color: #111827;">
                ${recipientGreeting}
              </p>` : ''}

              <!-- Main Message Body -->
              ${bodyText ? `
              <p style="margin: 0 0 28px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #1f2937;">
                ${bodyText}
              </p>` : ''}

              ${extraHtml || ''}

              ${button ? `
              <!-- Action Button & Expiration Notice -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 0 30px 0; width: 100%;">
                <tr>
                  <td style="vertical-align: middle; width: 180px;">
                    <a href="${button.url}" style="display: inline-block; background-color: #212529; color: #ffffff; text-decoration: none; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; padding: 13px 20px; border-radius: 8px; line-height: 1.25; text-align: left; box-shadow: 0 2px 4px rgba(0,0,0,0.15);">
                      <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="color: #ffffff; font-size: 14px; font-weight: 700; line-height: 1.2; padding-right: 14px; font-family: inherit;">
                            ${button.label || 'Access<br>Statement'}
                          </td>
                          <td style="color: #ffffff; font-size: 18px; font-weight: 700; line-height: 1; vertical-align: middle;">
                            &rarr;
                          </td>
                        </tr>
                      </table>
                    </a>
                  </td>
                  <td style="vertical-align: middle; padding-left: 18px;">
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.45; color: #374151;">
                      ${button.expiryText || 'This link will expire in 24 hours and can be used only once.'}
                    </div>
                  </td>
                </tr>
              </table>` : ''}

              ${fallbackUrl ? `
              <!-- Fallback Alternate Link -->
              <p style="margin: 0 0 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #1f2937;">
                ${fallbackNote || 'Alternately, you can use the secure portal link below to complete your action.'}
              </p>
              <p style="margin: 0 0 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.5; word-break: break-all;">
                <a href="${fallbackUrl}" style="color: #1d4ed8; text-decoration: underline;">${fallbackUrl}</a>
              </p>` : ''}
            </td>
          </tr>

          <!-- Dark Footer -->
          <tr>
            <td style="background-color: #1a1e22; padding: 22px 32px; border-top: 1px solid #111417;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="left" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #94a3b8; line-height: 1.6;">
                    &copy; ${currentYear} US24 Solutions. All rights reserved.<br>
                    <a href="${helpUrl}" style="color: #cbd5e1; text-decoration: none; font-weight: 600;">Account Help</a> &nbsp;<span style="color: #475569;">|</span>&nbsp;
                    <a href="${termsUrl}" style="color: #cbd5e1; text-decoration: none; font-weight: 600;">Terms of Use</a> &nbsp;<span style="color: #475569;">|</span>&nbsp;
                    <a href="${privacyUrl}" style="color: #cbd5e1; text-decoration: none; font-weight: 600;">Privacy</a>
                  </td>
                </tr>
              </table>
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
  /**
   * Patient Statement Notification email matching the exact template reference.
   */
  statementNotification: ({ to, patientName, clinicName, link, expiryHours = 24 }) => {
    const displayClinic = clinicName || 'MY CLINIC';
    const text = `Hello ${patientName || 'Valued Patient'},\n\nYour recent statement from ${displayClinic} is now available to view and download online. Please use the secure link below to access it:\n\n${link}\n\nThis link will expire in ${expiryHours} hours and can be used only once.\n\nAlternately, you can use the secure portal link below to complete your action:\n${link}${footerText}`;

    const html = emailWrapper({
      title: `Your Statement from ${displayClinic} is Available`,
      clinicName: displayClinic,
      recipientGreeting: 'Dear Valued Patient,',
      bodyText: 'Your recent statement is now available to view and download online. Please use the secure button below to access it.',
      button: {
        label: 'Access<br>Statement',
        url: link,
        expiryText: `This link will expire in ${expiryHours} hours and can be used only once.`,
      },
      fallbackNote: 'Alternately, you can use the secure portal link below to complete your action.',
      fallbackUrl: link,
      footerClinicName: 'US24 Solutions',
    });

    return send({
      to,
      subject: `Your statement from ${displayClinic} is ready to view`,
      text,
      html,
    });
  },

  otpCode: (to, name, code, clinicName = 'MY CLINIC') => {
    const text = `Hello ${name},\n\nYour sign-in code is: ${code}\n\nIt expires in ${config.session.otpMinutes} minutes and can be used once.${footerText}`;
    const html = emailWrapper({
      title: 'Your sign-in code',
      clinicName: clinicName || 'MY CLINIC',
      recipientGreeting: `Dear ${name},`,
      bodyText: 'Your sign-in verification code is ready. Use the secure code below to access your account:',
      extraHtml: `
        <div style="background-color: #f0f4ff; border: 2px dashed #253B80; border-radius: 8px; padding: 18px; text-align: center; margin: 18px 0 24px 0;">
          <span style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #253B80;">${code}</span>
        </div>
        <p style="margin: 0 0 20px 0; color: #64748b; font-size: 13px; line-height: 1.5; text-align: center;">
          ⏱️ This code will expire in <strong>${config.session.otpMinutes} minutes</strong> and can only be used once.<br>
          🔒 For your security, never share this code with anyone.
        </p>
      `,
      footerClinicName: 'US24 Solutions',
    });
    return send({ to, subject: 'Your sign-in code', text, html });
  },

  invitation: (to, name, link, clinicName = 'MY CLINIC') => {
    const text = `Hello ${name},\n\nUS24 Solutions has created an account for you. Set your password here:\n\n${link}\n\nThis link expires in ${config.tokens.inviteHours} hours.${footerText}`;
    const html = emailWrapper({
      title: "You've been invited",
      clinicName: clinicName || 'MY CLINIC',
      recipientGreeting: `Dear ${name},`,
      bodyText: 'US24 Solutions has created an account for you. Please use the secure button below to set your password and activate your account.',
      button: {
        label: 'Activate<br>Account',
        url: link,
        expiryText: `This link will expire in ${config.tokens.inviteHours} hours and can be used only once.`,
      },
      fallbackNote: 'Alternately, you can use the secure portal link below to complete your action.',
      fallbackUrl: link,
      footerClinicName: 'US24 Solutions',
    });
    return send({ to, subject: "You've been invited", text, html });
  },

  passwordReset: (to, name, link, clinicName = 'MY CLINIC') => {
    const text = `Hello ${name},\n\nUse this link to set a new password:\n\n${link}\n\nThis link expires in ${config.tokens.resetMinutes} minutes and can be used once.${footerText}`;
    const html = emailWrapper({
      title: 'Reset your password',
      clinicName: clinicName || 'MY CLINIC',
      recipientGreeting: `Dear ${name},`,
      bodyText: 'We received a request to reset your password. Please use the secure button below to choose a new password.',
      button: {
        label: 'Reset<br>Password',
        url: link,
        expiryText: `This link will expire in ${config.tokens.resetMinutes} minutes and can be used only once.`,
      },
      fallbackNote: 'Alternately, you can use the secure portal link below to complete your action.',
      fallbackUrl: link,
      footerClinicName: 'US24 Solutions',
    });
    return send({ to, subject: 'Reset your password', text, html });
  },
};
