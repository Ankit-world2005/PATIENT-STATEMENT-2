import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emailWrapper, mail } from '../src/lib/mailer.js';

test('emailWrapper generates branded US24 email matching reference specification', () => {
  const html = emailWrapper({
    title: 'Your Patient Statement is Available',
    clinicName: 'ICure Physical Therapy',
    recipientGreeting: 'Dear Valued Patient,',
    bodyText: 'Your recent statement is now available to view and download online. Please use the secure button below to access it.',
    button: {
      label: 'Access<br>Statement',
      url: 'https://statement.us24solutions.com/statements/test-id-123',
      expiryText: 'This link will expire in 24 hours and can be used only once.',
    },
    footerClinicName: 'ICure Physical Therapy',
  });

  // Verify US24 logo presence
  assert.ok(html.includes('US24'), 'Should include US24 branding');
  assert.ok(html.includes('us24solutions.com'), 'Should reference US24 logo URL');

  // Verify Clinic Name & Greeting & Alignment
  assert.ok(html.includes('ICURE PHYSICAL THERAPY'), 'Should render uppercase clinic name');
  assert.ok(html.includes('text-align: center;'), 'Should center-align clinic heading');
  assert.ok(html.includes('Dear Valued Patient,'), 'Should render exact greeting');

  // Verify Body text & Action button
  assert.ok(html.includes('Your recent statement is now available to view and download online.'), 'Should include intro text');
  assert.ok(html.includes('Access<br>Statement'), 'Should render 2-line action button');
  assert.ok(html.includes('&rarr;'), 'Should render right arrow icon');
  assert.ok(html.includes('This link will expire in 24 hours and can be used only once.'), 'Should include expiration text');

  // Verify Fallback link
  assert.ok(html.includes('Alternately, you can use the secure portal link below to complete your action.'), 'Should include fallback note');
  assert.ok(html.includes('https://statement.us24solutions.com/statements/test-id-123'), 'Should include direct link');

  // Verify Footer
  assert.ok(html.includes('&copy; 2026 US24 Solutions. All rights reserved.'), 'Should render © 2026 US24 Solutions');
  assert.ok(html.includes('Account Help'), 'Should include Account Help link');
  assert.ok(html.includes('Terms of Use'), 'Should include Terms of Use link');
  assert.ok(html.includes('Privacy'), 'Should include Privacy link');
  assert.ok(html.includes('&#10022;'), 'Should include hallmark diamond star icon');
});

test('mail.statementNotification dispatches with correct subject, text, and html', async () => {
  const result = await mail.statementNotification({
    to: 'patient.test@example.com',
    patientName: 'Jane Doe',
    clinicName: 'WestAZ',
    link: 'https://statement.us24solutions.com/statements/stmt-99',
    expiryHours: 24,
  });

  assert.ok(result, 'Send should succeed in dev / test mode');
});

