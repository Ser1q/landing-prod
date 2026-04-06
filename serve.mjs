import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { google } from 'googleapis';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const PORT = Number(process.env.PORT) || 3000;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

const mime = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.mjs': 'application/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

const sheetsAuth = new google.auth.GoogleAuth({
  keyFile: join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheetsClient = google.sheets({ version: 'v4', auth: sheetsAuth });

const parseJsonBody = (req) => new Promise((resolveBody, rejectBody) => {
  const chunks = [];
  let size = 0;

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > 1024 * 1024) {
      rejectBody(new Error('Payload too large'));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    try {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      const body = raw ? JSON.parse(raw) : {};
      resolveBody(body);
    } catch {
      rejectBody(new Error('Invalid JSON'));
    }
  });

  req.on('error', () => rejectBody(new Error('Request read error')));
});

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const appendLeadToSheet = async ({ companyName, phoneNumber, email }) => {
  if (!GOOGLE_SHEET_ID) {
    throw new Error('GOOGLE_SHEET_ID is missing in .env');
  }

  await sheetsClient.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: 'A:D',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[new Date().toISOString(), companyName, phoneNumber, email]],
    },
  });
};

const server = createServer(async (req, res) => {
  if (!req.url || !req.method) {
    sendJson(res, 400, { ok: false, error: 'Bad request' });
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'POST' && url.pathname === '/api/leads') {
    try {
      const body = await parseJsonBody(req);
      const companyName = String(body.companyName || '').trim();
      const phoneNumber = String(body.phoneNumber || '').trim();
      const email = String(body.email || '').trim();

      if (!phoneNumber) {
        sendJson(res, 400, { ok: false, error: 'Phone number is required' });
        return;
      }

      await appendLeadToSheet({ companyName, phoneNumber, email });
      sendJson(res, 200, { ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected server error';
      const status = message === 'Invalid JSON' ? 400 : 500;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = resolve(__dirname, `.${requestPath}`);

  if (!filePath.startsWith(__dirname)) {
    sendJson(res, 403, { ok: false, error: 'Forbidden' });
    return;
  }

  try {
    const data = await readFile(filePath);
    const ct = mime[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
