import { identity } from "@/lib/identity";
import { POLICIES, consumeRateLimit, requestFingerprint } from "@/lib/security/rate-limit";
import { setting } from "@/lib/settings";

/**
 * The operating entity's certificate image for the footer's secure viewer —
 * entirely operator-supplied: CERTIFICATE_IMAGE holds the bytes as base64
 * (a `data:<mime>;base64,…` URL is accepted and its MIME type used; otherwise
 * CERTIFICATE_MIME names it, default image/webp). With no image configured
 * the endpoint reports 404 and the viewer never renders.
 *
 * Only same-origin fetch() calls are served: opening the URL in a tab
 * (Sec-Fetch-Dest: document) or embedding it as an <img> elsewhere is refused.
 * This deters casual saving and hotlinking; it cannot stop a determined client
 * that forges headers, or a screenshot.
 */

let certificateBytes: Uint8Array<ArrayBuffer> | null = null;
let certificateMime = "image/webp";

function loadCertificate(): Uint8Array<ArrayBuffer> | null {
  if (certificateBytes) return certificateBytes;
  const raw = setting("CERTIFICATE_IMAGE")?.trim();
  if (!raw) return null;
  const dataUrl = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)?(?:;[^,]*)?;base64,/i.exec(raw);
  if (dataUrl) {
    if (dataUrl[1]) certificateMime = dataUrl[1];
    else certificateMime = setting("CERTIFICATE_MIME")?.trim() || certificateMime;
  } else {
    certificateMime = setting("CERTIFICATE_MIME")?.trim() || certificateMime;
  }
  const base64 = raw.replace(/^data:[^,]*,/, "");
  try {
    certificateBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
  return certificateBytes;
}

export async function GET(request: Request) {
  const bytes = loadCertificate();
  if (!bytes || !identity().certificateEnabled) {
    return Response.json({ ok: false, error: "No certificate is configured on this deployment." }, { status: 404, headers: { "cache-control": "no-store" } });
  }

  const site = request.headers.get("sec-fetch-site");
  const dest = request.headers.get("sec-fetch-dest");
  if (site !== "same-origin" || dest !== "empty") {
    return Response.json({ ok: false, error: "Viewable only on this site." }, { status: 403, headers: { "cache-control": "no-store" } });
  }

  const limit = await consumeRateLimit(requestFingerprint(request.headers), POLICIES.certificate);
  if (!limit.allowed) {
    return Response.json({ ok: false, error: "Too many requests." }, { status: 429, headers: { "cache-control": "no-store" } });
  }

  return new Response(bytes, {
    headers: {
      "content-type": certificateMime,
      "content-disposition": "inline",
      "cache-control": "private, no-store, max-age=0",
      "cross-origin-resource-policy": "same-origin",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex, noimageindex, noarchive",
    },
  });
}
