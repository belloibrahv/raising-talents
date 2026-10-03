import { DetectModerationLabelsCommand, type RekognitionClient } from '@aws-sdk/client-rekognition';
import type { ContentScanner } from '../application/ports.js';

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
    return Promise.resolve([
      { name: 'No automatic scan: check by eye', parentName: null, confidence: this.reviewAt },
    ]);
  }
}

/** Reports a borderline label for every image, so everything waits for a moderator. */
export class DevelopmentHoldAllScanner implements ContentScanner {
  scanImage(): Promise<readonly { name: string; parentName: string | null; confidence: number }[]> {
    return Promise.resolve([{ name: 'Suggestive', parentName: null, confidence: 60 }]);
  }
}
