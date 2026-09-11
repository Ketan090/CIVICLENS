import { NextRequest, NextResponse } from "next/server";
const UNO_KEY = process.env.UNO_API_KEY || "sk-M9KExYKZiSS7bUVtb0oKXNrdjPKYb2vl7nn4gkpM1eCZyYf3";
const UNO_URL = "https://api.unorouter.com/v1/chat/completions";
const UNO_MODELS = ["gemini-3.1-flash-lite:free","gemini-3.6-flash:free","qwen2.5-vl-7b-instruct-awq:free"];
const OPEN_KEY = process.env.OPENROUTER_API_KEY || "OPENROUTER_KEY_PLACEHOLDER";
const OPEN_URL = "https://openrouter.ai/api/v1/chat/completions";
let lastIdx = 0;
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
  // 1) Uno first (7 vision, 12s each, fast switch on 429/403/404)
  for (let attempt = 0; attempt < UNO_MODELS.length; attempt++) {
    const idx = (lastIdx + attempt) % UNO_MODELS.length;
    const tryModel = UNO_MODELS[idx];
    try {
      const r = await fetch(UNO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${UNO_KEY}` },
        body: JSON.stringify({ model: tryModel, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }] }], temperature: 0.3, max_tokens: 900 }),
        signal: AbortSignal.timeout(12000) as any,
      });
      if (!r.ok) { const txt=await r.text(); lastError=`${tryModel} ${r.status}: ${txt.slice(0,200)}`; if(r.status===429||r.status===403||r.status===404||r.status>=500) continue; return NextResponse.json({ demo: true, message: `Uno ${r.status} on ${tryModel}: ${txt.slice(0,400)}` }, { status: 200, headers: { "Cache-Control": "no-store" } }); }
      const j = (await r.json()) as any;
      const content = j.choices?.[0]?.message?.content || "";
      if (!content || content.trim().length < 5) { lastError=`${tryModel} blank`; continue; }
      const m = content.match(/\{[\s\S]*\}/);
      let parsed: any = m ? JSON.parse(m[0]) : { raw: content };
      if (parsed && !parsed.raw && (!parsed.whatSeen || String(parsed.whatSeen).trim().length < 5)) { lastError=`${tryModel} blank whatSeen`; continue; }
      lastIdx = idx;
      return NextResponse.json({ engine: "unorouter", demo: false, data: parsed, raw: content, model: tryModel, tried: attempt+1 }, { headers: { "Cache-Control": "no-store" } });
    } catch (e: any) { lastError = `${tryModel} error: ${String(e.message||e).slice(0,100)}`; continue; }
  }
  // 2) OpenRouter free vision (fallback)
  try {
    const r2 = await fetch(OPEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPEN_KEY}`, "HTTP-Referer": "http://localhost:3000", "X-Title": "CivicLens" },
      body: JSON.stringify({ model: "inclusionai/ling-3.0-flash-vl:free", messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }] }], temperature: 0.3, max_tokens: 900 }),
      signal: AbortSignal.timeout(20000) as any,
    });
    if (r2.ok) {
      const j2 = (await r2.json()) as any;
      const c2 = j2.choices?.[0]?.message?.content || "";
      const m2 = c2.match(/\{[\s\S]*\}/);
      let p2: any = m2 ? JSON.parse(m2[0]) : { raw: c2 };
      return NextResponse.json({ engine: "openrouter", demo: false, data: p2, raw: c2, model: "inclusionai/ling-3.0-flash-vl:free" }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch {}
  return NextResponse.json({ demo: true, message: `All Uno 7 vision busy/rate-limited (1 req/min). Last: ${lastError}. Also tried OpenRouter. Wait 60s or start LM Studio (qwen2.5-vl) at 127.0.0.1:1234 for unlimited.` }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
export async function GET() {
  let unoOk=false, openOk=false;
  try{ const r=await fetch(UNO_URL, {method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${UNO_KEY}`}, body:JSON.stringify({model:UNO_MODELS[0], messages:[{role:"user", content:[{type:"text", text:"ping"}]} ], max_tokens:5}), signal:AbortSignal.timeout(4000) as any}); unoOk=r.ok; }catch{}
  try{ const r2=await fetch(OPEN_URL, {method:"POST", headers:{"Content-Type":"application/json", Authorization:`Bearer ${OPEN_KEY}`, "HTTP-Referer":"http://localhost:3000"}, body:JSON.stringify({model:"inclusionai/ling-3.0-flash-vl:free", messages:[{role:"user", content:[{type:"text", text:"ping"}]} ], max_tokens:5}), signal:AbortSignal.timeout(4000) as any}); openOk=r2.ok; }catch{}
  return NextResponse.json({ unorouter:{url:UNO_URL, model:UNO_MODELS[0], reachable:unoOk, freeCount:UNO_MODELS.length}, openrouter:{url:OPEN_URL, reachable:openOk}, engine: unoOk?"unorouter":openOk?"openrouter":"offline"}, {headers:{"Cache-Control":"no-store"}});
}
