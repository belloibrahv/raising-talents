// Lighthouse CI: the public screens, served as CloudFront serves them, on a throttled phone.
// Accessibility and best practices must be perfect; performance has headroom for noisy runners.
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'node scripts/serve-like-cloudfront.mjs 4180 --stub-api',
      startServerReadyPattern: 'Serving',
      url: [
        'http://localhost:4180/welcome',
        'http://localhost:4180/sign-in',
        'http://localhost:4180/sign-up',
      ],
      numberOfRuns: 3,
      settings: { chromeFlags: '--headless=new --no-sandbox' },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.85, aggregationMethod: 'median-run' }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 1 }],
        // robots.txt keeps search engines out while everything is behind sign-in (ADR-033),
        // so the SEO category is not scored; the parts that still matter are checked alone.
        'document-title': 'error',
        'meta-description': 'error',
        'http-status-code': 'error',
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci/reports' },
  },
};
