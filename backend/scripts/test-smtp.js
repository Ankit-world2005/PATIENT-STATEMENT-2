import { config } from '../src/config.js';
import { verifyConnection, mail } from '../src/lib/mailer.js';

console.log('--- My Patient SMTP Diagnostics ---');
console.log(`Service:  ${config.smtp.service || '(custom host)'}`);
console.log(`Host:     ${config.smtp.host}`);
console.log(`Port:     ${config.smtp.port}`);
console.log(`Secure:   ${config.smtp.secure}`);
console.log(`User:     ${config.smtp.user ? config.smtp.user : '(empty)'}`);
console.log(`Pass:     ${config.smtp.pass ? '****** (' + config.smtp.pass.length + ' chars)' : '(empty)'}`);
console.log(`From:     ${config.mailFrom}`);
console.log('------------------------------------\n');

if (!config.smtp.user || !config.smtp.pass) {
  console.log('⚠️  SMTP_USER or SMTP_PASS is missing in server/.env.');
  console.log('For Gmail:');
  console.log('1. Go to Google Account Security: https://myaccount.google.com/security');
  console.log('2. Enable 2-Step Verification');
  console.log('3. Generate an App Password at: https://myaccount.google.com/apppasswords');
  console.log('4. Add to server/.env:');
  console.log('   SMTP_USER=your-email@gmail.com');
  console.log('   SMTP_PASS=xxxx xxxx xxxx xxxx');
  process.exit(1);
}

console.log('Connecting and verifying SMTP credentials...');
const res = await verifyConnection();
if (!res.ok) {
  console.error('\n❌ SMTP Verification FAILED:');
  console.error(res.message);
  if (res.code === 'EAUTH') {
    console.error('\nAuthentication rejected by Gmail:');
    console.error('1. Make sure 2-Step Verification is ON in your Google Account.');
    console.error('2. Generate a 16-character App Password at https://myaccount.google.com/apppasswords');
    console.error('3. Use the App Password (not your personal Google account password).');
  }
  process.exit(1);
}

console.log('✅ SMTP connection successfully verified!\n');

const testTo = process.argv[2] || config.smtp.user;
if (testTo) {
  console.log(`Sending a test OTP email to: ${testTo}...`);
  const sent = await mail.otpCode(testTo, 'Test User', '123456');
  if (sent) {
    console.log(`🎉 Test email sent successfully to ${testTo}! Check your inbox/spam folder.`);
  } else {
    console.error('❌ Failed to send test email.');
  }
}
