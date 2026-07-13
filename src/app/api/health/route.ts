export async function GET() {
  return Response.json({
    ok: true,
    service: "FE-06 streaming chat",
    checkedAt: new Date().toISOString(),
    runtime: process.version,
    routes: ["/", "/about", "/roadmap", "/deploy", "/health", "/api/chat"],
  });
}
