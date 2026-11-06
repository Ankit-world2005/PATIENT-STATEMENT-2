import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanFilename, contentDisposition, describeFile } from '../src/lib/attachment-files.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PDF = Buffer.from('%PDF-1.7\n%âãÏÓ\n', 'latin1');
const HTML = Buffer.from('<html><script src="/api/attachments/x"></script></html>');

test('images and PDFs open inline only when their bytes match the extension', () => {
  assert.deepEqual(describeFile('receipt.png', PNG), { mime: 'image/png', inline: true, storageExt: 'png' });
  assert.deepEqual(describeFile('Photo.JPG', JPEG), { mime: 'image/jpeg', inline: true, storageExt: 'jpg' });
  assert.deepEqual(describeFile('eob.pdf', PDF), { mime: 'application/pdf', inline: true, storageExt: 'pdf' });
  // An HTML page renamed to .png is served as an opaque download, never rendered.
  assert.deepEqual(describeFile('evil.png', HTML), { mime: 'application/octet-stream', inline: false, storageExt: 'png' });
  assert.equal(describeFile('evil.pdf', HTML).inline, false);
});

test('office files, CSV and unusual formats download with a server-chosen type', () => {
  assert.equal(describeFile('ledger.xlsx', Buffer.from('PK\x03\x04')).mime,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.deepEqual(describeFile('export.csv', Buffer.from('a,b\n1,2')), { mime: 'text/csv; charset=utf-8', inline: false, storageExt: 'csv' });
  // iPhone photos: kept as image/heic for the name/icon, stored as .bin, downloaded.
  assert.deepEqual(describeFile('IMG_0001.HEIC', Buffer.from('....ftypheic')), { mime: 'image/heic', inline: false, storageExt: 'bin' });
  assert.deepEqual(describeFile('page.html', HTML), { mime: 'application/octet-stream', inline: false, storageExt: 'bin' });
  assert.deepEqual(describeFile('drawing.svg', HTML), { mime: 'application/octet-stream', inline: false, storageExt: 'bin' });
});

test('files without an extension are recognised by their bytes', () => {
  assert.deepEqual(describeFile('image', PNG), { mime: 'image/png', inline: true, storageExt: 'png' });
  assert.deepEqual(describeFile('scan', PDF), { mime: 'application/pdf', inline: true, storageExt: 'pdf' });
  assert.deepEqual(describeFile('notes', HTML), { mime: 'application/octet-stream', inline: false, storageExt: 'bin' });
});

test('text files are shown as plain text', () => {
  assert.deepEqual(describeFile('notes.txt', HTML), { mime: 'text/plain; charset=utf-8', inline: true, storageExt: 'txt' });
});

test('cleanFilename strips folders and control characters and keeps the extension', () => {
  assert.equal(cleanFilename('C:\\Users\\me\\Desktop\\EOB March.pdf'), 'EOB March.pdf');
  assert.equal(cleanFilename('../../etc/passwd'), 'passwd');
  assert.equal(cleanFilename('bad\u0000name\r\n.png'), 'badname.png');
  assert.equal(cleanFilename(''), 'attachment');
  assert.equal(cleanFilename('..'), 'attachment');
  const long = cleanFilename(`${'x'.repeat(300)}.pdf`);
  assert.equal(long.length, 255);
  assert.ok(long.endsWith('.pdf'));
});

test('contentDisposition keeps spaces and accents intact for every browser', () => {
  assert.equal(
    contentDisposition('inline', 'EOB March.pdf'),
    `inline; filename="EOB March.pdf"; filename*=UTF-8''EOB%20March.pdf`,
  );
  assert.equal(
    contentDisposition('attachment', 'Récépissé "final" (1).pdf'),
    `attachment; filename="R_c_piss_ _final_ (1).pdf"; filename*=UTF-8''R%C3%A9c%C3%A9piss%C3%A9%20%22final%22%20%281%29.pdf`,
  );
});
