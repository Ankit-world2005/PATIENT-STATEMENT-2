import serverless from 'serverless-http';
import { createApp } from '../../server/src/app.js';

const app = createApp();

export const handler = serverless(app, {
  binary: [
    'application/pdf',
    'application/octet-stream',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/*',
  ],
  request(req) {
    if (req.url.startsWith('/.netlify/functions/api')) {
      req.url = req.url.replace('/.netlify/functions/api', '/api');
    } else if (!req.url.startsWith('/api')) {
      req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
    }
  },
});
