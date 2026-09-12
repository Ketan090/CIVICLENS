import { NextRequest, NextResponse } from "next/server";
const PROVIDERS = [
  { name: "qwen", url: "https://api.unorouter.com/v1/chat/completions", key: process.env.UNO_API_KEY || "UNO_KEY_PLACEHOLDER", models: ["qwen2.5-vl-7b-instruct-awq:free"] },
];
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ demo: true, message: "No image" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const file = form.get("image") as Blob | null;
  if (!file) return NextResponse.json({ demo: true, message: "No image" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const buf = Buffer.from(await file.arrayBuffer());
  const b64 = buf.toString("base64");
  const prompt = `You are CivicLens — tell what you see in 2-3 sentences. If civic problem (pothole garbage flood drain crack sidewalk streetlight debris dumping traffic water scarcity air pollution), list them. RequestId:${Date.now()}
Respond ONLY valid JSON:
{"isCivic":true,"problem":"Pothole + Garbage or No civic issue","category":"Road Infrastructure|Waste Management|Water & Drainage|Infrastructure|Air Quality|No Issue","confidence":0-100,"severity":"Low|Medium|High","whatSeen":"2-3 sentences describing exactly what is visible","evidences":["bullet1","bullet2"],"complaintLetter":"1 paragraph if civic else empty","detections":[{"label":"POTHOLE","category":"Road Infrastructure","confidence":92,"box":{"x":28,"y":38,"w":34,"h":26}}]}
Rules: isCivic=true if any civic problem else false. If false, detections=[] and problem="No civic issue". Never leave whatSeen empty.
`;
  let lastError = "";
  for (const prov of PROVIDERS) {
    for (const tryModel of prov.models) {
      try {
        const headers: Record<string,string> = { "Content-Type": "application/json" };
        if (prov.key) headers["Authorization"] = `Bearer ${prov.key}`;
        if (prov.name==="openrouter") { headers["HTTP-Referer"]="http://localhost:3000"; headers["X-Title"]="CivicLens"; }
        let body: string;
        let url = prov.url;
        if (prov.name==="cohere") {
          body = JSON.stringify({ model: tryModel, message: prompt, max_tokens: 900 });
        } else {
          body = JSON.stringify({ model: tryModel, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }] }], temperature: 0.3, max_tokens: 900 });
        }
        const r = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(15000) as any });
        if (!r.ok) { const txt=await r.text(); lastError=`${prov.name}:${tryModel} ${r.status}: ${txt.slice(0,120)}`; if(r.status===429||r.status===403||r.status===404||r.status>=500) continue; return NextResponse.json({ demo: true, message: `${prov.name} ${r.status} on ${tryModel}: ${txt.slice(0,400)}` }, { status: 200, headers: { "Cache-Control": "no-store" } }); }
        const j = (await r.json()) as any;
        const content = j.choices?.[0]?.message?.content || j.text || j.choices?.[0]?.text || "";
        if (!content || content.trim().length < 5) { lastError=`${tryModel} blank`; continue; }
        const m = content.match(/\{[\s\S]*\}/);
        let parsed: any = m ? JSON.parse(m[0]) : { raw: content };
        if (parsed && !parsed.raw) {
          const p = parsed as any;
          if (!p.whatSeen || String(p.whatSeen).trim().length < 10) p.whatSeen = p.isCivic===false ? "No civic issue — image shows general scene." : `Civic issue visible: ${p.problem}`;
          if (!p.evidences || !Array.isArray(p.evidences) || p.evidences.length===0) p.evidences = p.detections?.map((d:any)=>`${d.label} ${d.confidence||88}%`) || ["Visible scene analyzed"];
          if (p.isCivic!==false && (!p.detections || p.detections.length===0) && p.problem && !/no civic/i.test(p.problem)) p.detections=[{label:String(p.problem).toUpperCase().slice(0,18), category:p.category||"Civic", confidence:p.confidence||88, box:{x:28,y:38,w:42,h:28}}];
          if (p.isCivic===false) { p.detections=[]; }
        }
        return NextResponse.json({ engine: prov.name, demo: false, data: parsed, raw: content, model: tryModel }, { headers: { "Cache-Control": "no-store" } });
      } catch (e: any) { lastError = `${prov.name}:${tryModel} error: ${String(e.message||e).slice(0,100)}`; continue; }
    }
  }
  return NextResponse.json({ demo: true, message: `All providers busy. Last: ${lastError}. Try again in 30s or start LM Studio.` }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
export async function GET() {
  const checks = await Promise.all(PROVIDERS.map(async p=>{
    try{
      const headers: Record<string,string> = { "Content-Type": "application/json" };
      if(p.key) headers["Authorization"]=`Bearer ${p.key}`;
      if(p.name==="openrouter") headers["HTTP-Referer"]="http://localhost:3000";
      const body = p.name==="cohere" ? JSON.stringify({ model: p.models[0], message:"ping", max_tokens:5 }) : JSON.stringify({ model: p.models[0], messages:[{role:"user", content:[{type:"text", text:"ping"}]}], max_tokens:5 });
      const r=await fetch(p.url, {method:"POST", headers, body, signal:AbortSignal.timeout(3000) as any});
      return { name:p.name, reachable:r.ok, model:p.models[0] };
    }catch{
      return { name:p.name, reachable:false, model:p.models[0] };
    }
  }));
  const engine = checks.find(c=>c.reachable)?.name || "offline";
  return NextResponse.json({ providers: checks, engine }, { headers: { "Cache-Control": "no-store" } });
}
