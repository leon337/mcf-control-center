export async function GET() {
  return Response.json({
    status: "ok",
    service: "mcf-control-center",
    mode: "baseline-shell",
  });
}
