import { NextRequest, NextResponse } from "next/server";
const TL:Record<string,string>={en:"en",hi:"hi",mr:"mr",ta:"ta",te:"te",kn:"kn",ml:"ml",bn:"bn",gu:"gu",pa:"pa",ur:"ur",or:"or",as:"as",vi:"vi"};
async function googleTTS(text:string, lang:string):Promise<Buffer|null>{
  try{
    const tl=TL[lang.slice(0,2).toLowerCase()]||"en";
    const chunks=text.match(/.{1,180}(?=\s|$)/g) || [text];
    let out=Buffer.alloc(0);
    for(const ch of chunks.slice(0,4)){
      const q=encodeURIComponent(ch.trim());
      if(!q) continue;
      const url=`https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${q}&tl=${tl}&client=gtx`;
      const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0"}, signal: AbortSignal.timeout(6000) as any});
      if(!r.ok) continue;
      const b=Buffer.from(await r.arrayBuffer());
      if(b.length>500) out=Buffer.concat([out,b]);
    }
    return out.length>1000?out:null;
  }catch{ return null; }
}
export async function POST(req: NextRequest){
  try{
    const {text, lang="en"} = await req.json();
    if(!text || typeof text!=="string") return NextResponse.json({error:"text required"},{status:400});
    const clean=String(text).slice(0,600);
    const buf=await googleTTS(clean, String(lang));
    if(buf) return new NextResponse(buf as any,{headers:{"Content-Type":"audio/mpeg","Cache-Control":"no-store"}});
    return NextResponse.json({fallback:true, useWebSpeech:true},{status:200});
  }catch(e:any){
    return NextResponse.json({error:String(e.message||e)},{status:500});
  }
}
