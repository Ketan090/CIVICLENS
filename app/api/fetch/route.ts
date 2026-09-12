import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
  try {
    const { url, format = "markdown" } = await req.json();
    if (!url || !/^https?:\/\//.test(url)) return NextResponse.json({ error: "Provide http(s) URL" }, { status: 400 });
    const r = await fetch(url, { headers: { "User-Agent": "CivicLens/1.0" }, signal: AbortSignal.timeout(10000) as any });
    if (!r.ok) return NextResponse.json({ error: `Fetch ${r.status}: ${r.statusText}` }, { status: 400 });
    const ct = r.headers.get("content-type") || "";
    let text = await r.text();
    if (format === "text") text = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 20000);
    return NextResponse.json({ url, contentType: ct, length: text.length, content: text.slice(0, 30000) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message||e).slice(0,300) }, { status: 500 });
  }
}
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ usage: "POST {url, format} or GET ?url=https://example.com" });
  try {
    const r = await fetch(url, { headers: { "User-Agent": "CivicLens/1.0" }, signal: AbortSignal.timeout(10000) as any });
    const txt = await r.text();
    return new NextResponse(txt.slice(0,30000), { headers: { "Content-Type": r.headers.get("content-type")||"text/html", "Cache-Control": "no-store" } });
  } catch (e:any) { return NextResponse.json({ error: String(e.message) }, { status: 500 }); }
}
