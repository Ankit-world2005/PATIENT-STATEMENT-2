import { createApp } from '../backend/src/app.js';

const app = createApp();

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60,
};

export default function handler(req, res) {
  if (!req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return app(req, res);
}
