/** One label from the content scanner, with its parent category when it has one. */
export interface ModerationLabel {
  readonly name: string;
  readonly parentName: string | null;
  readonly confidence: number;
}

/** Thresholds live in configuration so trust and safety can tune them without a release. */
export interface ScanPolicy {
  /** Any label at or above this confidence sends the asset to a moderator. */
  readonly reviewAt: number;
  /** A label in a rejected category at or above this confidence rejects the asset outright. */
  readonly rejectAt: number;
}

export type RejectionCategory = 'sexual' | 'violence' | 'hate';

export type ScanDecision =
  | { readonly outcome: 'ready' }
  | { readonly outcome: 'held'; readonly labels: readonly ModerationLabel[] }
  | {
      readonly outcome: 'rejected';
      readonly category: RejectionCategory;
      readonly labels: readonly ModerationLabel[];
    };

/** Rekognition label names (taxonomy v7) that the design says to reject at high confidence. */
const REJECTED: Record<string, RejectionCategory> = {
  Explicit: 'sexual',
  'Explicit Nudity': 'sexual',
  'Explicit Sexual Activity': 'sexual',
  'Sex Toys': 'sexual',
  'Graphic Violence': 'violence',
  'Graphic Violence Or Gore': 'violence',
  'Hate Symbols': 'hate',
};

const categoryOf = (label: ModerationLabel): RejectionCategory | undefined =>
  REJECTED[label.name] ?? (label.parentName ? REJECTED[label.parentName] : undefined);

/** Design section 10, "Scan decisions". */
export function decideScan(labels: readonly ModerationLabel[], policy: ScanPolicy): ScanDecision {
  const rejecting = labels.find(
    (label) => label.confidence >= policy.rejectAt && categoryOf(label) !== undefined,
  );
  if (rejecting) {
    return { outcome: 'rejected', category: categoryOf(rejecting) ?? 'sexual', labels };
  }
  const flagged = labels.filter((label) => label.confidence >= policy.reviewAt);
  return flagged.length > 0 ? { outcome: 'held', labels: flagged } : { outcome: 'ready' };
}

/** What the owner reads. It names the rule, never the scanner's raw labels. */
export const REJECTION_REASON: Record<RejectionCategory, string> = {
  sexual:
    'This image looks like it contains nudity or sexual content, which the Community Guidelines do not allow.',
  violence:
    'This image looks like it shows graphic violence, which the Community Guidelines do not allow.',
  hate: 'This image looks like it contains a hate symbol, which the Community Guidelines do not allow.',
};
