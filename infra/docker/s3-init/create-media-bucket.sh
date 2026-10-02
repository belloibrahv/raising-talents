#!/bin/sh
# Runs inside LocalStack once S3 is ready. Recreates what staging has: the media bucket,
# uploads from the web app's origin, and public reads of processed media (CloudFront in AWS).
set -eu
BUCKET=raising-talents-media-local

awslocal s3 mb "s3://$BUCKET"
awslocal s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration '{
  "CORSRules": [{
    "AllowedOrigins": ["http://localhost:5173", "http://localhost:4173"],
    "AllowedMethods": ["POST", "GET"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 600
  }]
}'
awslocal s3api put-bucket-policy --bucket "$BUCKET" --policy '{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::'"$BUCKET"'/media/*"
  }]
}'
echo "Media bucket $BUCKET is ready"
