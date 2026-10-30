import { identity } from "@/lib/identity";
import type {
  EvidenceSource,
  ReportFinding,
  VerdictStatus,
} from "@/lib/types";
import { clamp, round } from "@/lib/utils";

/**
 * Verdict scoring.
 *
 * The scorer is deliberately simple and fully explainable: every point of
 * confidence can be traced back to a named finding or a retrieved source.
 * When there is no evidence and no strong signal the engine abstains rather
 * than guessing (blueprint §3, §14).
 */

export interface ScoreInput {
  findings: ReportFinding[];
  sources: EvidenceSource[];
  category: "claim" | "website" | "product" | "media";
  /** True when at least one authoritative/official record was consulted. */
  authoritativeHit?: boolean;
  /** True when a definitive negative signal exists (checksum fail, threat hit). */
  definitiveNegative?: boolean;
  /** True when a definitive positive exists (valid C2PA manifest, official record match). */
  definitivePositive?: boolean;
}

export interface ScoreResult {
  status: VerdictStatus;
  confidence: number | null;
  riskScore: number;
  supportScore: number;
  explanation: string;
}

const SEVERITY_WEIGHT: Record<ReportFinding["severity"], number> = {
  risk: 1,
  warning: 0.55,
  positive: -1,
  info: 0,
  unknown: 0.1,
};

export function score(input: ScoreInput): ScoreResult {
  const { findings, sources, category } = input;

  let riskScore = 0;
  let supportScore = 0;
  for (const f of findings) {
    const w = f.weight * (SEVERITY_WEIGHT[f.severity] ?? 0);
    if (f.severity === "positive") supportScore += Math.abs(w);
    else if (f.severity === "risk" || f.severity === "warning") riskScore += w;
    else if (f.severity === "unknown") riskScore += w * 0.3;
  }

  const supports = sources.filter((s) => s.stance === "supports");
  const contradicts = sources.filter((s) => s.stance === "contradicts");
  supportScore += supports.length * 0.35;
  riskScore += contradicts.length * 0.45;

  const evidenceCount = sources.length;
  const net = supportScore - riskScore;

  // Abstention guard: no evidence, no definitive signal → we cannot conclude.
  if (
    evidenceCount === 0 &&
    !input.definitiveNegative &&
    !input.definitivePositive &&
    riskScore < 0.5 &&
    supportScore < 0.5
  ) {
    return {
      status: "unable_to_verify",
      confidence: null,
      riskScore: round(riskScore),
      supportScore: round(supportScore),
      explanation:
        "No authoritative source was reachable for this input and no definitive structural signal was present, so the engine abstained instead of guessing.",
    };
  }

  // A failed checksum, a threat-list hit or a fabricated identifier is proof of
  // a defect in the identifier itself — not proof that the object is counterfeit.
  if (input.definitiveNegative) {
    const confidence = clamp(0.72 + riskScore * 0.1 + (evidenceCount ? 0.05 : 0), 0, 0.97);
    return {
      status: category === "website" ? "high_risk" : category === "claim" ? "contradicted" : "suspicious",
      confidence: round(confidence),
      riskScore: round(riskScore),
      supportScore: round(supportScore),
      explanation:
        "A definitive structural or reputation failure was detected. This is recorded as a hard signal, not an inference.",
    };
  }

  if (input.definitivePositive) {
    const confidence = clamp(0.6 + supportScore * 0.1 + (evidenceCount ? 0.08 : 0), 0, 0.9);
    return {
      status: category === "claim" ? "supported" : "verified",
      confidence: round(confidence),
      riskScore: round(riskScore),
      supportScore: round(supportScore),
      explanation:
        "The supplied details match an identified official or signed record. Confidence is capped because a match confirms the record, not the physical object in front of you.",
    };
  }

  if (category === "claim") {
    if (net <= -0.8 && contradicts.length) return verdict("contradicted", riskScore, supportScore, evidenceCount, net);
    if (net <= -0.4) return verdict("misleading", riskScore, supportScore, evidenceCount, net);
    if (net <= -0.15) return verdict("disputed", riskScore, supportScore, evidenceCount, net);
    if (net >= 0.8 && supports.length >= 2) return verdict("supported", riskScore, supportScore, evidenceCount, net);
    return verdict("unable_to_verify", riskScore, supportScore, evidenceCount, net);
  }

  if (category === "website") {
    if (riskScore >= 1.6) return verdict("high_risk", riskScore, supportScore, evidenceCount, net);
    if (riskScore >= 0.7) return verdict("suspicious", riskScore, supportScore, evidenceCount, net);
    if (supportScore >= 1 && riskScore < 0.25) return verdict("verified", riskScore, supportScore, evidenceCount, net);
    return verdict("unable_to_verify", riskScore, supportScore, evidenceCount, net);
  }

  if (category === "product") {
    if (riskScore >= 1.4) return verdict("suspicious", riskScore, supportScore, evidenceCount, net);
    if (supportScore >= 1.4 && riskScore < 0.35) return verdict("likely_authentic", riskScore, supportScore, evidenceCount, net);
    if (supportScore >= 0.6 && riskScore < 0.5) return verdict("unable_to_verify", riskScore, supportScore, evidenceCount, net);
    return verdict("unable_to_verify", riskScore, supportScore, evidenceCount, net);
  }

  // media
  if (riskScore >= 1.2) return verdict("suspicious", riskScore, supportScore, evidenceCount, net);
  if (input.authoritativeHit && supportScore >= 0.8) return verdict("verified", riskScore, supportScore, evidenceCount, net);
  return verdict("unable_to_verify", riskScore, supportScore, evidenceCount, net);
}

function verdict(
  status: VerdictStatus,
  riskScore: number,
  supportScore: number,
  evidenceCount: number,
  net: number,
): ScoreResult {
  const magnitude = Math.max(Math.abs(net), riskScore, supportScore);
  const confidence = status === "unable_to_verify"
    ? null
    : round(clamp(0.34 + magnitude * 0.16 + Math.min(evidenceCount, 6) * 0.045, 0.3, 0.93));
  const explanation = status === "unable_to_verify"
    ? `Evidence was insufficient to reach a conclusion (support ${round(supportScore)} vs risk ${round(riskScore)} across ${evidenceCount} source(s)). This does not mean the subject is fake or false.`
    : `Weighted evidence resolved to "${status}" — support ${round(supportScore)}, risk ${round(riskScore)}, ${evidenceCount} retrieved source(s).`;
  return { status, confidence, riskScore: round(riskScore), supportScore: round(supportScore), explanation };
}

export function makeFinding(
  kind: string,
  title: string,
  detail: string,
  severity: ReportFinding["severity"],
  weight = 1,
  sourceRefs: number[] = [],
): ReportFinding {
  return { kind, title, detail, severity, weight, sourceRefs };
}

export const LIMITATION_LIBRARY = {
  noProviderKey:
    "External source providers are not configured in this deployment, so only the local rules engine and any reachable public records were used.",
  serialInsufficient:
    "A serial number, IMEI or barcode alone cannot prove a physical item is genuine: counterfeiters copy valid identifiers from authentic units.",
  noFactCheckNotProof:
    "The absence of an existing fact-check does not establish that a claim is true. It means no reviewed claim was found in the sources queried.",
  pixelForensics:
    "Pixel-level manipulation detection was not performed. Metadata and provenance analysis cannot prove an image was or was not altered.",
  aiLimits:
    "AI-generated-content classifiers produce false positives and false negatives. A generator signature is evidence of origin metadata, not proof the depicted event is false.",
  pointInTime:
    "Reputation, DNS and page content change over time. This report reflects the state of the sources at the timestamp shown.",
  noFetch:
    "The submitted URL was not fetched by the server (outbound fetching is disabled or the target failed SSRF validation), so on-page behaviour could not be observed.",
  physicalInspection:
    "Physical inspection — weight, materials, port negotiation, hidden test menus — remains necessary for a conclusive authenticity decision.",
  get legalReview() {
    return `${identity().appName} reports evidence, not legal conclusions. Do not treat any finding as an accusation against a named person or business.`;
  },
} as const;
