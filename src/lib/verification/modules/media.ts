import type { EvidenceSource, ProviderCall, ReportFinding } from "@/lib/types";
import { analyzeMedia, forensicsToEvidence, type MediaForensics } from "@/lib/media/forensics";
import { searchWeb, searchResultsToEvidence } from "@/lib/providers/research";
import { formatBytes } from "@/lib/utils";
import { StepTimer, extractDates, type ModuleInput, type ModuleOutput } from "@/lib/verification/module";
import { LIMITATION_LIBRARY, makeFinding, score } from "@/lib/verification/scoring";
import { truncate } from "@/lib/utils";

/**
 * Image & Video Identifier.
 *
 * Reports what the *file* proves and what it cannot. Provenance metadata is
 * evidence about the file's history, never about whether the depicted event
 * actually happened (blueprint §5).
 */

export async function verifyMedia(input: ModuleInput): Promise<ModuleOutput> {
  const timer = new StepTimer();
  const findings: ReportFinding[] = [];
  const sources: EvidenceSource[] = [];
  const providers: ProviderCall[] = [];
  const limitations: string[] = [];
  const text = input.raw;

  const ctx: { forensics: MediaForensics | null } = { forensics: null };

  await timer.run("Identify the container", "Read the file signature and container structure from raw bytes.", async () => {
    if (!input.file) {
      findings.push(makeFinding("container", "No media file attached",
        "Attach the image or video file itself. A URL or a description cannot be forensically inspected — platforms strip and rewrite metadata on upload.",
        "unknown", 0.5));
      limitations.push("No binary was supplied, so no metadata, provenance or container analysis was possible.");
      return "skipped";
    }
    const f = analyzeMedia(input.file.data);
    ctx.forensics = f;
    providers.push({
      provider: "heuristics",
      operation: `forensics:${f.format}`,
      status: "ok",
      latencyMs: 0,
      costUsd: 0,
      detail: `Parsed ${formatBytes(input.file.bytes)} of ${f.format.toUpperCase()} container data locally. SHA-256 ${input.file.sha256.slice(0, 16)}…`,
    });
    findings.push(makeFinding("container", `Container identified as ${f.format.toUpperCase()}`,
      `${formatBytes(input.file.bytes)} · ${f.width ?? "?"}×${f.height ?? "?"} px · SHA-256 ${input.file.sha256.slice(0, 24)}… · internal storage path ${input.file.name}`,
      "info", 0.2));
    sources.push({
      provider: "heuristics",
      title: `Local container analysis of ${input.file.name}`,
      excerpt: forensicsToEvidence(f).join(" "),
      stance: "context",
      retrievedAt: new Date().toISOString(),
      trustTier: "official",
      meta: { sha256: input.file.sha256, format: f.format, entropy: f.entropy },
    });
    return "done";
  });

  await timer.run("Inspect provenance metadata", "Look for a C2PA / Content Credentials manifest and edit-history records.", async () => {
    const f = ctx.forensics;
    if (!f) return "skipped";
    if (f.c2pa.present) {
      findings.push(makeFinding("provenance", "C2PA / Content Credentials manifest detected",
        `${f.c2pa.detail} Labels found: ${f.c2pa.labels.join(", ") || "n/a"}. A signed manifest records who created or edited the asset and with what tool. Note: a manifest proves file history, not that the depicted event is truthful.`,
        "positive", 1.0));
    } else {
      findings.push(makeFinding("provenance", "No provenance manifest present",
        "The file carries no C2PA / Content Credentials manifest. Most images shared through messaging apps and social platforms have provenance stripped, so absence is normal and is not evidence of manipulation.",
        "unknown", 0.45));
      limitations.push("Without a C2PA manifest there is no signed record of this file's creation or edit history.");
    }
    return "done";
  });

  await timer.run("Read camera and editing metadata", "EXIF capture device, software tags, timestamps, GPS and thumbnails.", async () => {
    const f = ctx.forensics;
    if (!f) return "skipped";
    if (f.cameraMake || f.cameraModel) {
      findings.push(makeFinding("metadata", "Capture device recorded",
        `${f.cameraMake ?? ""} ${f.cameraModel ?? ""}${f.exif.LensModel ? ` with ${f.exif.LensModel}` : ""}. A first-generation camera file usually retains this; a re-saved or downloaded image usually does not.`,
        "positive", 0.6));
    } else if (f.format === "jpeg" || f.format === "heif/avif-or-mp4") {
      findings.push(makeFinding("metadata", "No camera metadata present",
        "There is no Make/Model EXIF block. This is expected for screenshots, downloaded images, and anything passed through a social platform — it is not by itself suspicious.",
        "unknown", 0.3));
    }
    if (f.software) {
      findings.push(makeFinding("metadata", `Saving software tag: ${f.software}`,
        f.editSignals.length
          ? `The file was written by ${f.software}, which is an editing application rather than a camera. Editing is legitimate; it means this is not a first-generation capture.`
          : "The file was last written by this application rather than directly by a camera.",
        f.editSignals.length ? "warning" : "info", 0.5));
    }
    if (f.capturedAt && f.modifiedAt && f.capturedAt !== f.modifiedAt) {
      findings.push(makeFinding("metadata", "Capture and modification timestamps differ",
        `Captured ${f.capturedAt}, re-saved ${f.modifiedAt}. The file was written again after capture — by an editor, a converter, or a platform.`,
        "warning", 0.4));
    }
    if (f.gpsPresent) {
      findings.push(makeFinding("metadata", "GPS metadata is present",
        "Location coordinates survived in this file. If you did not intend to share a location, remove metadata before publishing.",
        "info", 0.2));
    }
    if (f.thumbnailPresent) {
      findings.push(makeFinding("metadata", "Embedded EXIF thumbnail present",
        "The EXIF thumbnail is sometimes an older version of the image and can reveal content removed from the main picture.",
        "info", 0.25));
    }
    if (Object.keys(f.exif).length) {
      findings.push(makeFinding("metadata", `${Object.keys(f.exif).length} EXIF field(s) recovered`,
        Object.entries(f.exif).slice(0, 14).map(([k, v]) => `${k}: ${truncate(String(v), 90)}`).join("\n"),
        "info", 0.15));
    } else if (f.format !== "unknown") {
      findings.push(makeFinding("metadata", "No EXIF fields recovered",
        "The container holds no EXIF block at all — typical of screenshots, generative outputs and platform-recompressed uploads.",
        "unknown", 0.3));
    }
    return "done";
  });

  await timer.run("Scan for generative-tool signatures", "Search XMP, PNG text chunks and container strings for known generator markers.", async () => {
    const f = ctx.forensics;
    if (!f) return "skipped";
    if (f.generatorSignals.length) {
      for (const g of f.generatorSignals) {
        findings.push(makeFinding("generative", `Signature of ${g.tool}`,
          `The string "${g.evidence}" was found in the ${g.field} data of the file. Many generative tools write their parameters into the image; their presence indicates the file was produced or processed by that tool.`,
          "risk", 0.9));
      }
      if (f.pngText.some((c) => /parameters|prompt|workflow/i.test(c.key))) {
        const chunk = f.pngText.find((c) => /parameters|prompt|workflow/i.test(c.key))!;
        findings.push(makeFinding("generative", `Generation parameters preserved in PNG "${chunk.key}"`,
          truncate(chunk.value, 600), "risk", 0.5));
      }
    } else {
      findings.push(makeFinding("generative", "No generative-tool signature found",
        "No Stable Diffusion, ComfyUI, Midjourney, OpenAI, Firefly, FLUX or IPTC generative-source markers are present in this file. Absence of a marker does not prove the image is a camera capture — generators can be configured not to write metadata, and platforms strip it.",
        "info", 0.1));
      limitations.push("A negative generator-signature scan cannot rule out synthetic origin; most pipelines strip or never write these markers.");
    }
    return "done";
  });

  await timer.run("Statistical container analysis", "Byte entropy, JPEG marker path and recompression indicators.", async () => {
    const f = ctx.forensics;
    if (!f) return "skipped";
    findings.push(makeFinding("statistics", `Byte entropy ${f.entropy.toFixed(3)} / 8.0`,
      f.entropy > 7.6
        ? "Very high entropy across the whole file is expected for compressed image data. Extremely uniform high entropy can also indicate an encrypted or synthetically generated payload, but this alone is not discriminating."
        : f.entropy < 5.5
          ? "Unusually low entropy for a compressed image: large flat regions, a heavily quantised re-save, or a mostly-uniform synthetic render."
          : "Entropy is in the normal range for compressed photographic data.",
      f.entropy < 5.5 ? "warning" : "info", f.entropy < 5.5 ? 0.3 : 0.1));
    if (f.format === "jpeg") {
      findings.push(makeFinding("statistics", "JPEG structure profile",
        `Marker path ${f.jpegMarkerPath.slice(0, 14).join(" → ")} · ${f.quantTables} quantisation table(s) · ${f.progressive ? "progressive" : "baseline"} · ${f.restartMarkers} restart marker(s). A file saved twice by different encoders usually carries quantisation tables that do not match the claimed camera.`,
        "info", 0.2));
      if (f.quantTables > 2) {
        findings.push(makeFinding("statistics", "More quantisation tables than a single-encoder save",
          `${f.quantTables} DQT segments suggest multiple encode passes or an appended/thumbnail stream.`,
          "warning", 0.35));
      }
    }
    limitations.push(LIMITATION_LIBRARY.pixelForensics);
    return "done";
  });

  await timer.run("Search for published context", "Look for earlier appearances or reporting about the same media.", async () => {
    if (!input.flags.expensiveEnabled || text.trim().length < 20) {
      providers.push({ provider: "web-search", operation: "context", status: "skipped", latencyMs: 0, costUsd: 0, detail: "Out-of-context detection needs a caption, location or event description to search for." });
      limitations.push("No textual context was supplied with the media, so reverse-context searching could not run. Out-of-context reuse is the most common form of misleading media.");
      return "skipped";
    }
    const dates = extractDates(text);
    const { results, call } = await searchWeb(`${truncate(text, 140)} photo video original date`, { reportId: input.reportId, maxResults: 6 });
    providers.push(call);
    if (results.length) {
      sources.push(...searchResultsToEvidence(results));
      findings.push(makeFinding("context", `${results.length} result(s) about this media's subject`,
        results.slice(0, 5).map((r) => `${r.source} — ${truncate(r.snippet, 160)}`).join("\n"),
        "info", 0.3));
      const earliest = results.filter((r) => r.publishedAt).map((r) => r.publishedAt!).sort()[0];
      if (earliest && dates.length) {
        findings.push(makeFinding("context", "Compare the claimed date with the earliest published date",
          `The submission references ${dates.join(", ")}; the earliest retrieved publication is ${earliest.slice(0, 10)}. If the media predates the event it is attached to, the pairing is misleading even if the file is genuine.`,
          "warning", 0.55));
      }
    } else {
      limitations.push("No published context was retrieved for this media.");
    }
    return results.length ? "done" : "skipped";
  });

  limitations.push(LIMITATION_LIBRARY.aiLimits, LIMITATION_LIBRARY.pointInTime);
  if (!input.file) limitations.push("Video frame-level analysis is not implemented in this release; attach a still frame for container forensics.");

  const scored = score({
    findings,
    sources,
    category: "media",
    authoritativeHit: Boolean(ctx.forensics?.c2pa.present),
    definitiveNegative: false,
    definitivePositive: false,
  });

  const generatorCount = ctx.forensics?.generatorSignals.length ?? 0;
  const headline =
    generatorCount > 0 ? "Generative-tool signatures present in this file"
    : ctx.forensics?.c2pa.present ? "Signed provenance manifest present"
    : ctx.forensics ? "No manipulation evidence — but no proof of authenticity either"
    : "Unable to verify — no media file supplied";

  const summary = [
    ctx.forensics
      ? `${ctx.forensics.format.toUpperCase()}, ${ctx.forensics.width ?? "?"}×${ctx.forensics.height ?? "?"}, ${formatBytes(ctx.forensics.sizeBytes)}.`
      : "No file was attached.",
    headline + ".",
    scored.explanation,
    generatorCount ? `${generatorCount} generator signature(s) matched.` : "",
  ].filter(Boolean).join(" ");

  const nextSteps = input.file
    ? [
        "Ask for the original file, not a screenshot of it — each re-save destroys metadata.",
        "Run a reverse image search on the picture to find earlier appearances with different captions.",
        "Check the claimed date and place against weather, skyline, signage, vehicle plates and shadows in the frame.",
        "If provenance matters, request a C2PA-signed asset and verify it at contentcredentials.org/verify.",
        "Report the media to the platform hosting it; do not reshare it while its status is unresolved.",
      ]
    : [
        "Attach the actual image or video file so container forensics can run.",
        "Include the caption, date and location the media is being shared with — out-of-context reuse needs that text to detect.",
        "Never judge a screenshot: request the original upload.",
      ];

  return {
    category: "media",
    status: scored.status,
    confidence: scored.confidence,
    headline,
    summary: truncate(summary, 900),
    findings,
    sources,
    limitations,
    nextSteps,
    payload: {
      forensics: ctx.forensics
        ? {
            format: ctx.forensics.format,
            width: ctx.forensics.width,
            height: ctx.forensics.height,
            sizeBytes: ctx.forensics.sizeBytes,
            entropy: ctx.forensics.entropy,
            c2pa: ctx.forensics.c2pa,
            exif: ctx.forensics.exif,
            gpsPresent: ctx.forensics.gpsPresent,
            thumbnailPresent: ctx.forensics.thumbnailPresent,
            software: ctx.forensics.software ?? null,
            camera: [ctx.forensics.cameraMake, ctx.forensics.cameraModel].filter(Boolean).join(" ") || null,
            capturedAt: ctx.forensics.capturedAt ?? null,
            modifiedAt: ctx.forensics.modifiedAt ?? null,
            pngText: ctx.forensics.pngText.slice(0, 6),
            generatorSignals: ctx.forensics.generatorSignals,
            editSignals: ctx.forensics.editSignals,
            jpegMarkerPath: ctx.forensics.jpegMarkerPath,
            quantTables: ctx.forensics.quantTables,
            progressive: ctx.forensics.progressive,
            xmpFields: Object.fromEntries(Object.entries(ctx.forensics.xmpFields).slice(0, 20)),
            sha256: input.file?.sha256 ?? null,
          }
        : null,
      supportScore: scored.supportScore,
      riskScore: scored.riskScore,
    },
    workflow: timer.list,
    providers,
    authoritativeHit: Boolean(ctx.forensics?.c2pa.present),
  };
}
