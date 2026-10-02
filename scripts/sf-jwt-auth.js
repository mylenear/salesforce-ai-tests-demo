#!/usr/bin/env node
// Salesforce JWT Bearer Token Flow — zero external dependencies
//
// Required env vars:
//   SF_CLIENT_ID      Connected App Consumer Key
//   SF_PRIVATE_KEY    RSA private key PEM (use \n for newlines in .env)
//
// Optional env vars:
//   SF_JWT_USERNAME   Username to authenticate (falls back to SF_TEST_USERNAME)
//   SF_LOGIN_URL      Defaults to https://login.salesforce.com
//
// Output (stdout): JSON with access_token, instance_url, frontdoor_url
// Exit code 1 on any error (message on stderr)

const crypto = require('crypto');
const https = require('https');
const querystring = require('querystring');

function base64url(buf) {
  return buf.toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function buildJWT(clientId, username, audience, privateKeyPem) {
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(Buffer.from(JSON.stringify({
    iss: clientId,
    sub: username,
    aud: audience,
    exp: now + 180,
  })));
  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign('SHA256');
  sign.update(signingInput);
  const signature = base64url(sign.sign(privateKeyPem));
  return `${signingInput}.${signature}`;
}

function exchangeJWT(jwt, loginUrl) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    });
    const url = new URL(`${loginUrl}/services/oauth2/token`);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(`Salesforce error: ${parsed.error} — ${parsed.error_description}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Unexpected response (HTTP ${res.statusCode}): ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const clientId   = process.env.SF_CLIENT_ID;
  const username   = process.env.SF_JWT_USERNAME || process.env.SF_TEST_USERNAME;
  const privateKey = process.env.SF_PRIVATE_KEY;
  const loginUrl   = (process.env.SF_LOGIN_URL || 'https://login.salesforce.com').replace(/\/$/, '');

  if (!clientId)   { process.stderr.write('Missing SF_CLIENT_ID\n');   process.exit(1); }
  if (!username)   { process.stderr.write('Missing SF_JWT_USERNAME (or SF_TEST_USERNAME)\n'); process.exit(1); }
  if (!privateKey) { process.stderr.write('Missing SF_PRIVATE_KEY\n'); process.exit(1); }

  // Allow \n literals in .env files to be treated as real newlines
  const pem = privateKey.replace(/\\n/g, '\n');

  const jwt    = buildJWT(clientId, username, loginUrl, pem);
  const token  = await exchangeJWT(jwt, loginUrl);
  const result = {
    access_token:  token.access_token,
    instance_url:  token.instance_url,
    frontdoor_url: `${token.instance_url}/secur/frontdoor.jsp?sid=${token.access_token}`,
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch(err => {
  process.stderr.write(err.message + '\n');
  process.exit(1);
});
