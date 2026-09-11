import { NextRequest, NextResponse } from "next/server";
const OPEN_KEY = process.env.OPENROUTER_API_KEY || "OPENROUTER_API_KEY_PLACEHOLDER";
const OPEN_URL = "https://openrouter.ai/api/v1/chat/completions";
const FREE_VISION = [
  "inclusionai/ling-3.0-flash-vl:free","nex-agi/nex-n2.5-pro:free","nex-agi/nex-n2.5-mini:free","google/gemma-4-31b-it:free","nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free","thinkingmachines/inkling:free","dots-studio/dots-3-note-preview:free"
];
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ demo: true, message: "No image" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const file = form.get("image") as Blob | null;
  if (!file) return NextResponse.json({ demo: true, message: "No image" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const buf = Buffer.from(await file.arrayBuffer());
  const b64 = buf.toString("base64");
  let lastError = "";
  for (const tryModel of FREE_VISION) {
    const prompt = `You are CivicLens — tell what you see in 2-3 sentences. If civic problem (pothole garbage flood drain crack sidewalk streetlight debris dumping traffic water scarcity air pollution), list them. RequestId:${Date.now()}
Respond ONLY valid JSON:
{"isCivic":true,"problem":"Pothole + Garbage or No civic issue","category":"Road Infrastructure|Waste Management|Water & Drainage|Infrastructure|Air Quality|No Issue","confidence":0-100,"severity":"Low|Medium|High","whatSeen":"2-3 sentences describing exactly what is visible","evidences":["bullet1","bullet2"],"complaintLetter":"1 paragraph if civic else empty","detections":[{"label":"POTHOLE","category":"Road Infrastructure","confidence":92,"box":{"x":28,"y":38,"w":34,"h":26}}]}
Rules: isCivic=true if any civic problem else false. If false, detections=[] and problem="No civic issue". Never leave whatSeen empty.
`;
    try {
      const r = await fetch(OPEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPEN_KEY}`, "HTTP-Referer": "http://localhost:3000", "X-Title": "CivicLens" },
        body: JSON.stringify({ model: tryModel, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }] }], temperature: 0.3, max_tokens: 900 }),
        signal: AbortSignal.timeout(20000) as any,
      });
      if (!r.ok) { const txt=await r.text(); lastError=`${tryModel} ${r.status}: ${txt.slice(0,200)}`; if(r.status===429||r.status===404) continue; return NextResponse.json({ demo: true, message: `OpenRouter ${r.status} on ${tryModel}: ${txt.slice(0,400)}` }, { status: 200, headers: { "Cache-Control": "no-store" } }); }
      const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      const content = j.choices?.[0]?.message?.content || "";
      if (!content || content.trim().length < 5) { lastError=`${tryModel} blank`; continue; }
      const m = content.match(/\{[\s\S]*\}/);
      let parsed: any = null;
      if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = { raw: content }; } } else parsed = { raw: content };
      if (parsed && typeof parsed === "object" && !parsed.raw) {
        const p = parsed as any;
        if (!p.whatSeen || String(p.whatSeen).trim().length < 10) p.whatSeen = p.isCivic===false ? "No civic issue — image shows general scene." : `Civic issue visible: ${p.problem}`;
        if (!p.evidences || !Array.isArray(p.evidences) || p.evidences.length===0) p.evidences = p.detections?.map((d:any)=>`${d.label} ${d.confidence||88}%`) || ["Visible scene analyzed"];
        if (p.isCivic!==false && (!p.detections || p.detections.length===0) && p.problem && !/no civic/i.test(p.problem)) p.detections=[{label:String(p.problem).toUpperCase().slice(0,18), category:p.category||"Civic", confidence:p.confidence||88, box:{x:28,y:38,w:42,h:28}}];
        if (p.isCivic===false) { p.detections=[]; }
      }
      return NextResponse.json({ engine: "openrouter", demo: false, data: parsed, raw: content, model: tryModel }, { headers: { "Cache-Control": "no-store" } });
    } catch (e: unknown) { lastError = `${tryModel} error: ${String((e as Error).message||e).slice(0,100)}`; continue; }
  }
  return NextResponse.json({ demo: true, message: `All OpenRouter free vision busy. Last: ${lastError}. Try again in 30s.` }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
export async function GET() {
  let ok=false; try{ const r=await fetch(OPEN_URL, { method:"POST", headers:{ "Content-Type":"application/json", Authorization:`Bearer ${OPEN_KEY}`, "HTTP-Referer":"http://localhost:3000" }, body: JSON.stringify({ model: FREE_VISION[0], messages:[{role:"user", content:[{type:"text", text:"ping"}]} ], max_tokens:5 }), signal: AbortSignal.timeout(4000) as any }); ok=r.ok; }catch{}
  return NextResponse.json({ openrouter: { url: OPEN_URL, model: FREE_VISION[0], reachable: ok, freeCount: FREE_VISION.length, models: FREE_VISION }, engine: ok?"openrouter":"offline" }, { headers: { "Cache-Control": "no-store" } });
}
