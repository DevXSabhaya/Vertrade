#!/usr/bin/env node
/**
 * One-time local tool to obtain GOOGLE_REFRESH_TOKEN for GoogleMailProvider
 * (src/modules/email/providers/google-mail.provider.ts). Not part of the
 * running application — run manually, once, on your own machine.
 *
 * Usage:
 *   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/get-google-refresh-token.js
 *
 * What it does:
 *   1. Starts a temporary local HTTP server on http://localhost:53682
 *   2. Opens (prints) the Google consent URL for scope
 *      https://www.googleapis.com/auth/gmail.send
 *   3. You sign in as vertrade19@gmail.com and approve
 *   4. Google redirects back to this local server with an auth code
 *   5. The script exchanges it for tokens and prints GOOGLE_REFRESH_TOKEN
 *
 * The OAuth client used to run this script MUST be a "Web application"
 * type client (not "Desktop app") with
 * http://localhost:53682/oauth2callback registered as an Authorized
 * redirect URI — that exact string is also the value to set for
 * GOOGLE_REDIRECT_URI in Render (see google-mail.provider.ts, which passes
 * it straight through to OAuth2Client's `redirectUri` option).
 */
const http = require('node:http');
const { URL } = require('node:url');
const { OAuth2Client } = require('google-auth-library');

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the environment before running this script.\n' +
      'Example: GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/get-google-refresh-token.js',
  );
  process.exit(1);
}

const oauth2Client = new OAuth2Client({
  clientId,
  clientSecret,
  redirectUri: REDIRECT_URI,
});

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline', // required to receive a refresh_token at all
  prompt: 'consent', // forces a refresh_token even if this app was authorized before
  scope: [SCOPE],
});

const server = http.createServer((req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== '/oauth2callback') {
    res.writeHead(404).end();
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end(
      `Authorization failed: ${error}`,
    );
    console.error(`Authorization failed: ${error}`);
    server.close();
    process.exit(1);
    return;
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end(
      'Missing authorization code',
    );
    return;
  }

  res
    .writeHead(200, { 'Content-Type': 'text/plain' })
    .end('Success — you can close this tab and return to the terminal.');

  oauth2Client
    .getToken(code)
    .then(({ tokens }) => {
      server.close();
      if (!tokens.refresh_token) {
        console.error(
          '\nNo refresh_token was returned. This happens if this Google account already\n' +
            'granted this exact OAuth client access before. Revoke prior access at\n' +
            'https://myaccount.google.com/permissions (find this app, remove access),\n' +
            'then run this script again.',
        );
        process.exit(1);
        return;
      }
      console.log('\nGOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
      console.log('\nPaste that exact line into Render (Environment tab).');
    })
    .catch((tokenError) => {
      server.close();
      console.error('\nFailed to exchange authorization code for tokens:', tokenError.message);
      process.exit(1);
    });
});

server.listen(PORT, () => {
  console.log('Open this URL, sign in as vertrade19@gmail.com, and approve access:\n');
  console.log(authUrl);
  console.log(`\nWaiting for the redirect to ${REDIRECT_URI} ...`);
});
