// Lets the web app upload straight to the media bucket from the browser (presigned POST).
//   pnpm --filter @rt/api storage:cors https://app.example.com [https://other.example.com]
// On AWS, Terraform sets this; on Railway (ADR-036), run it once after the first deploy.
import { PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';

const origins = process.argv.slice(2);
if (origins.length === 0 || origins.some((origin) => !/^https?:\/\/[^/]+$/.test(origin))) {
  throw new Error('Usage: storage:cors <origin> [origin...], each like https://app.example.com');
}
const bucket = process.env.MEDIA_BUCKET;
if (!bucket) throw new Error('MEDIA_BUCKET is not set');

const client = new S3Client({
  region: process.env.AWS_REGION ?? 'auto',
  ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT } : {}),
});
await client.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: origins,
          AllowedMethods: ['POST'],
          AllowedHeaders: ['*'],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);
process.stdout.write(`Uploads allowed from ${origins.join(', ')}\n`);
