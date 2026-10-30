import { fetchLiveShowcase, showcaseConfigured } from "@/lib/showcase";

/** The live showcase rail, read from the operator-configured source (see src/lib/showcase.ts). */
export async function GET() {
  if (!showcaseConfigured()) {
    return Response.json(
      { ok: false, error: "The showcase rail is not configured on this deployment (SHOWCASE_SOURCE_URL)." },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }
  try {
    const payload = await fetchLiveShowcase();
    return Response.json(
      { ok: true, ...payload },
      { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Showcase source unreachable" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}
