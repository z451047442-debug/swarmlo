export interface WitnessEntry {
  epoch: number;
  action?: string;
  signature?: string;
  timestamp?: string;
  hash?: string;
  previous_hash?: string;
}

export interface WitnessGap {
  deviceId: string;
  fromEpoch: number;
  toEpoch: number;
  missingCount: number;
}

export interface WitnessVerificationResult {
  deviceId: string;
  chainLength: number;
  verified: boolean;
  gaps: WitnessGap[];
  headEpoch: number;
  headHash: string;
  integrityScore: number;
  /** Human-readable notes explaining why a chain is (not) verified. */
  notes?: string[];
}

export interface WitnessVerificationDeps {
  getWitnessChain: (deviceId: string) => Promise<{
    length?: number;
    head?: string;
    entries?: Array<{ epoch: number; action?: string; signature?: string; timestamp?: string; hash?: string; previous_hash?: string }>;
  }>;
  /**
   * Optional per-entry signature verifier. The seed SDK exposes no witness
   * signature verification API, so callers must wire one (e.g. via the
   * device's published Ed25519 public key) before signed chains can be
   * attested. When entries carry signatures and no verifier is wired, the
   * chain is reported UNVERIFIED rather than falsely verified.
   */
  verifyEntrySignature?: (
    deviceId: string,
    entry: WitnessEntry,
  ) => Promise<boolean>;
}

export class WitnessVerificationService {
  constructor(private readonly deps: WitnessVerificationDeps) {}

  async verifyChain(deviceId: string): Promise<WitnessVerificationResult> {
    const chain = await this.deps.getWitnessChain(deviceId);
    const entries = chain.entries ?? [];
    const chainLength = chain.length ?? entries.length ?? 0;

    if (entries.length === 0) {
      // An empty chain attests nothing — the previous behavior returned
      // verified: true here, silently blessing a device with no provenance
      // record as fully trusted.
      const notes = chainLength > 0
        ? [`Device reports ${chainLength} witness entries but the chain endpoint returned none — data inconsistency`]
        : ['Witness chain is empty; nothing to attest'];
      return {
        deviceId,
        chainLength,
        verified: false,
        gaps: [],
        headEpoch: 0,
        headHash: chain.head ?? '',
        integrityScore: 0,
        notes,
      };
    }

    // If any entry carries a signature, the chain can only be attested when
    // every signed entry verifies. Without a verifier (the seed SDK exposes
    // none) we must not claim verification.
    const signedEntries = entries.filter(e => e.signature);
    let signaturesVerified = true;
    let notes: string[] | undefined;
    if (signedEntries.length > 0) {
      if (!this.deps.verifyEntrySignature) {
        signaturesVerified = false;
        notes = [
          `${signedEntries.length} witness entries carry signatures but no ` +
            'signature verifier is wired; chain not attested',
        ];
      } else {
        const results = await Promise.all(
          signedEntries.map(e => this.deps.verifyEntrySignature!(deviceId, e)),
        );
        signaturesVerified = results.every(Boolean);
        if (!signaturesVerified) {
          notes = ['One or more witness entry signatures failed verification'];
        }
      }
    }

    const sorted = [...entries].sort((a, b) => a.epoch - b.epoch);
    const gaps = this.detectGaps(deviceId, sorted);
    const hashValid = this.verifyHashChain(sorted);

    const gapRatio = gaps.length > 0
      ? gaps.reduce((sum, g) => sum + g.missingCount, 0) / chainLength
      : 0;

    const integrityScore = Math.max(0, 1 - gapRatio) * (hashValid ? 1 : 0.5);
    const verified = gaps.length === 0 && hashValid && signaturesVerified;

    if (verified && notes) {
      notes = undefined;
    }

    return {
      deviceId,
      chainLength,
      verified,
      gaps,
      headEpoch: sorted[sorted.length - 1].epoch,
      headHash: chain.head ?? sorted[sorted.length - 1].hash ?? '',
      integrityScore,
      ...(notes ? { notes } : {}),
    };
  }

  private detectGaps(
    deviceId: string,
    sorted: Array<{ epoch: number }>,
  ): WitnessGap[] {
    const gaps: WitnessGap[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const expected = sorted[i - 1].epoch + 1;
      const actual = sorted[i].epoch;
      if (actual > expected) {
        gaps.push({
          deviceId,
          fromEpoch: sorted[i - 1].epoch,
          toEpoch: actual,
          missingCount: actual - expected,
        });
      }
    }

    return gaps;
  }

  private verifyHashChain(
    sorted: Array<{ hash?: string; previous_hash?: string }>,
  ): boolean {
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].previous_hash && sorted[i - 1].hash && sorted[i].previous_hash !== sorted[i - 1].hash) {
        return false;
      }
    }
    return true;
  }
}
