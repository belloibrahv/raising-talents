import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import { randomUUID } from 'node:crypto';

// Generates an Ed25519 key pair for signing access tokens in local development.
// Staging and production keys live in AWS Secrets Manager and are rotated every 90 days.
const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
  crv: 'Ed25519',
  extractable: true,
});
const privatePem = await exportPKCS8(privateKey);
const publicPem = await exportSPKI(publicKey);

process.stdout.write(`JWT_PRIVATE_KEY_BASE64=${Buffer.from(privatePem).toString('base64')}\n`);
process.stdout.write(`JWT_PUBLIC_KEY_BASE64=${Buffer.from(publicPem).toString('base64')}\n`);
process.stdout.write(`JWT_KEY_ID=${randomUUID()}\n`);
