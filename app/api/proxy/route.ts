import { NextRequest, NextResponse } from "next/server";
export async function GET(req: NextRequest){
  const url=req.nextUrl.searchParams.get("url");
  if(!url) return NextResponse.json({error:"url required"},{status:400});
  try{
    const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0"}, signal: AbortSignal.timeout(8000) as any});
    if(!r.ok) return NextResponse.json({error:`fetch ${r.status}`},{status:502});
    const ct=r.headers.get("content-type")||"image/jpeg";
    if(!ct.startsWith("image/")) return NextResponse.json({error:"not image "+ct},{status:400});
    const buf=await r.arrayBuffer();
    return new NextResponse(buf,{headers:{"Content-Type":ct,"Cache-Control":"no-store"}});
  }catch(e:any){ return NextResponse.json({error:String(e.message||e)},{status:500}); }
}
