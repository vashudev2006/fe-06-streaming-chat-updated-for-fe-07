export async function GET() {
  return Response.json({
    ok: true,
    service: "FE-11 production streaming chat",
    checkedAt: new Date().toISOString(),
    runtime: process.version,
    safeguards: ["server-side-api-key", "rate-limit", "prompt-size-limit"],
    routes: ["/", "/about", "/roadmap", "/deploy", "/health", "/api/chat"],
  });
}
