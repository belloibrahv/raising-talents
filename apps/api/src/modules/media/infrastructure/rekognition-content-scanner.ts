import { DetectModerationLabelsCommand, type RekognitionClient } from '@aws-sdk/client-rekognition';
import type { ContentScanner } from '../application/ports.js';
import { NO_SCAN_LABEL } from '../domain/scan-decision.js';

/** Amazon Rekognition image moderation. Returns every label at 40% or more; the policy decides. */
export class RekognitionContentScanner implements ContentScanner {
  constructor(private readonly client: RekognitionClient) {}

  async scanImage(
    image: Buffer,
  ): Promise<readonly { name: string; parentName: string | null; confidence: number }[]> {
    const result = await this.client.send(
      new DetectModerationLabelsCommand({ Image: { Bytes: image }, MinConfidence: 40 }),
    );
    return (result.ModerationLabels ?? []).map((label) => ({
      name: label.Name ?? 'Unknown',
      parentName: label.ParentName ? label.ParentName : null,
      confidence: label.Confidence ?? 0,
    }));
  }
}

/**
 * Development only: approves everything so the pipeline can run without AWS.
 * Configuration validation refuses it in staging and production.
 */
export class DevelopmentAllowAllScanner implements ContentScanner {
  scanImage(): Promise<readonly { name: string; parentName: string | null; confidence: number }[]> {
    return Promise.resolve([]);
  }
}

/**
 * For deployments without automatic scanning (ADR-036): every image waits for a moderator.
 * The label says so plainly, and sits at the review threshold so it is held, never rejected.
 */
export class ManualReviewScanner implements ContentScanner {
  constructor(private readonly reviewAt: number) {}

  scanImage(): Promise<readonly { name: string; parentName: string | null; confidence: number }[]> {
    return Promise.resolve([{ name: NO_SCAN_LABEL, parentName: null, confidence: this.reviewAt }]);
  }
}

/**
 * Publishing without a check first (ADR-048): nothing is looked at before it goes live, so
 * there is nothing to report here. Members report what breaks the rules and moderators take
 * it down.
 */
export class NoContentScanner implements ContentScanner {
  scanImage(): Promise<readonly { name: string; parentName: string | null; confidence: number }[]> {
    return Promise.resolve([]);
  }
}

/** Reports a borderline label for every image, so everything waits for a moderator. */
export class DevelopmentHoldAllScanner implements ContentScanner {
  scanImage(): Promise<readonly { name: string; parentName: string | null; confidence: number }[]> {
    return Promise.resolve([{ name: 'Suggestive', parentName: null, confidence: 60 }]);
  }
}
