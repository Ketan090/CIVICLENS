import { NextRequest, NextResponse } from "next/server";
const NVIDIA_KEY = process.env.NVIDIA_API_KEY || "";
const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODELS = ["nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free","nvidia/nemotron-3.5-lightning:free","nvidia/llama-3.1-nemotron-70b-instruct:free"];
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ demo: true, message: "No image" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const file = form.get("image") as Blob | null;
  if (!file) return NextResponse.json({ demo: true, message: "No image" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const buf = Buffer.from(await file.arrayBuffer());
  const b64 = buf.toString("base64");
  if (!NVIDIA_KEY) return NextResponse.json({ demo: true, message: "NVIDIA_API_KEY not set. Set it in .env.local as NVIDIA_API_KEY=..." }, { status: 200, headers: { "Cache-Control": "no-store" } });
  const prompt = `You are CivicLens — tell what you see in 2-3 sentences. If civic problem (pothole garbage flood drain crack sidewalk streetlight debris dumping traffic water scarcity air pollution), list them. RequestId:${Date.now()}
Respond ONLY valid JSON:
{"isCivic":true,"problem":"Pothole + Garbage or No civic issue","category":"Road Infrastructure|Waste Management|Water & Drainage|Infrastructure|Air Quality|No Issue","confidence":0-100,"severity":"Low|Medium|High","whatSeen":"2-3 sentences describing exactly what is visible","evidences":["bullet1","bullet2"],"complaintLetter":"1 paragraph if civic else empty","detections":[{"label":"POTHOLE","category":"Road Infrastructure","confidence":92,"box":{"x":28,"y":38,"w":34,"h":26}}]}
Rules: isCivic=true if any civic problem else false. If false, detections=[] and problem="No civic issue". Never leave whatSeen empty.
`;
  let lastError = "";
  for (const tryModel of NVIDIA_MODELS) {
    try {
      const r = await fetch(NVIDIA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${NVIDIA_KEY}` },
        body: JSON.stringify({ model: tryModel, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }] }], temperature: 0.3, max_tokens: 900 }),
        signal: AbortSignal.timeout(20000) as any,
      });
      if (!r.ok) { const txt=await r.text(); lastError=`${tryModel} ${r.status}: ${txt.slice(0,200)}`; if(r.status===429||r.status===403||r.status===404||r.status>=500) continue; return NextResponse.json({ demo: true, message: `NVIDIA ${r.status} on ${tryModel}: ${txt.slice(0,400)}` }, { status: 200, headers: { "Cache-Control": "no-store" } }); }
      const j = (await r.json()) as any;
      const content = j.choices?.[0]?.message?.content || j.choices?.[0]?.text || "";
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
      return NextResponse.json({ engine: "nvidia", demo: false, data: parsed, raw: content, model: tryModel }, { headers: { "Cache-Control": "no-store" } });
    } catch (e: any) { lastError = `${tryModel} error: ${String(e.message||e).slice(0,100)}`; continue; }
  }
  return NextResponse.json({ demo: true, message: `NVIDIA all models busy. Last: ${lastError}. Try again in 30s or set NVIDIA_API_KEY.` }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
export async function GET() {
  let ok=false;
  try{ const r=await fetch(NVIDIA_URL, {method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${process.env.NVIDIA_API_KEY||""}`}, body: JSON.stringify({model:NVIDIA_MODELS[0], messages:[{role:"user", content:[{type:"text", text:"ping"}]} ], max_tokens:5}), signal:AbortSignal.timeout(4000) as any}); ok=r.ok; }catch{}
  return NextResponse.json({ nvidia: { url: NVIDIA_URL, model: NVIDIA_MODELS[0], reachable: ok, models: NVIDIA_MODELS }, engine: ok?"nvidia":"offline" }, { headers: { "Cache-Control": "no-store" } });
}
