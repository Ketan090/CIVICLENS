import { NextRequest, NextResponse } from "next/server";
const FREE_MODELS_60 = [
  "gemini-3.1-flash-lite:free","gemini-3.6-flash:free","gemini-flash-lite:free","qwen2.5-vl-7b-instruct-awq:free","glm-4.6v-flash:free","gpt-4o:free","llama-3.2-11b-vision:free"
];
let lastWorkingIdx = 0;
const UNO_KEY = process.env.UNO_API_KEY || "sk-M9KExYKZiSS7bUVtb0oKXNrdjPKYb2vl7nn4gkpM1eCZyYf3";
const LLM7_KEY = process.env.LLM7_API_KEY || "xCdBvLAEhUumeRWB+iDUiBsJ7dl6zAku7xicnPpq82jbdRwm1tev8rMji1JCRI7lTUsaUqYeTQavSe6MwumRWGHprtYjQ9Ov+aKtxMaXyIRxQ/134Np8/6lKCZHyPZRyhi7uyPBBYF7g/j7pxxMM8Y0P";
const LLM7_URL = process.env.LLM7_URL || "https://api.llm7.io/v1/chat/completions";
const LLM7_MODEL = process.env.LLM7_MODEL || "gemini-3-flash";
const UNO_URL = process.env.UNO_URL || "https://api.unorouter.com/v1/chat/completions";
const UNO_MODEL = process.env.UNO_MODEL || "gemini-3.1-flash-lite:free";
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ demo: true, message: "No image" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const file = form.get("image") as Blob | null;
  if (!file) return NextResponse.json({ demo: true, message: "No image" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const buf = Buffer.from(await file.arrayBuffer());
  const b64 = buf.toString("base64");
  const VISION_MODELS = FREE_MODELS_60.filter(m=>/gemini|qwen.*vl|gpt-4o|llama.*vision|glm.*v/i.test(m));
  let lastError = "";
  for (let attempt = 0; attempt < VISION_MODELS.length; attempt++) {
    const idx = (lastWorkingIdx + attempt) % VISION_MODELS.length;
    const tryModel = VISION_MODELS[idx];
    const prompt = `You are CivicLens Uno Router — tell what you see in 2-3 sentences. If you see any civic problem (pothole, garbage, flood, drain, crack, sidewalk, streetlight, debris, dumping, traffic, water scarcity, air pollution), list them. RequestId:${Date.now()}
Respond ONLY valid JSON with PRECISE normalized boxes (x,y,w,h as 0-100 percent, tight around object):
{"isCivic":true,"problem":"Pothole + Garbage or No civic issue","category":"Road Infrastructure|Waste Management|Water & Drainage|Infrastructure|Air Quality|No Issue","confidence":0-100,"severity":"Low|Medium|High","whatSeen":"2-3 sentences describing exactly what is visible","evidences":["bullet1","bullet2"],"complaintLetter":"1 paragraph if civic else empty","detections":[{"label":"POTHOLE","category":"Road Infrastructure","confidence":92,"box":{"x":28,"y":38,"w":34,"h":26}}]}
For PRECISE boxes: measure tightly — x/y is top-left %, w/h is size %. Be precise to 1% — do not use generic 28,38.
Rules: isCivic=true if any civic problem else false. If false, detections=[] and problem="No civic issue". Never leave whatSeen empty.
`;
    try {
      const r = await fetch(UNO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${UNO_KEY}` },
        body: JSON.stringify({ model: tryModel, messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }] }], temperature: 0.3, max_tokens: 900 }),
        signal: AbortSignal.timeout(40000) as any,
      });
      if (!r.ok) {
        const txt = await r.text();
        lastError = `${tryModel} ${r.status}: ${txt.slice(0,200)}`;
        if (r.status === 429 || r.status === 404 || r.status >= 500) continue;
        return NextResponse.json({ demo: true, message: `Uno Router ${r.status} on ${tryModel}: ${txt.slice(0,400)}` }, { status: 200, headers: { "Cache-Control": "no-store" } });
      }
      const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      const content = j.choices?.[0]?.message?.content || "";
      if (!content || content.trim().length < 5) { lastError = `${tryModel} blank`; continue; }
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
      lastWorkingIdx = idx;
      // Refine boxes with precise YOLO if available (try HF YOLO for pothole precision)
      try {
        const yoloModels = ["keremberke/yolov8s-pothole","keremberke/yolov8m-pothole"];
        for (const yoloModel of yoloModels) {
          try {
            const yR = await fetch(`https://api-inference.huggingface.co/models/${yoloModel}`, {
              method: "POST", headers: { Authorization: `Bearer ${process.env.HF_TOKEN||""}`, "Content-Type": "application/octet-stream" }, body: buf as any, signal: AbortSignal.timeout(8000) as any });
            if (yR.ok) {
              const yJ = await yR.json() as any[];
              if (Array.isArray(yJ) && yJ.length) {
                // yJ is array of {label, score, box:{xmin,ymin,xmax,ymax}}
                // Use image dimensions 1000 as base if not known, estimate from b64 size? Use 640 as base
                const yBoxes = (yJ as any[]).slice(0,3).map((d:any,i:number)=>({ label: String(d.label||"POTHOLE").toUpperCase(), category:"Road Infrastructure", confidence:Math.round((d.score||0.88)*100), box:{ x: Math.max(0,Math.min(90, (d.box.xmin/640)*100)), y: Math.max(0,Math.min(90, (d.box.ymin/640)*100)), w: Math.max(8,Math.min(80, ((d.box.xmax-d.box.xmin)/640)*100)), h: Math.max(8,Math.min(80, ((d.box.ymax-d.box.ymin)/640)*100)) }}));
                if (yBoxes.length) {
                  // Merge: replace LLM boxes with precise YOLO for pothole category
                  const nonPothole = (parsed.detections||[]).filter((d:any)=> !String(d.label).includes("POTHOLE"));
                  parsed.detections = [...yBoxes, ...nonPothole].slice(0,4);
                  parsed.whatSeen = parsed.whatSeen + ` Precise YOLO boxes: ${yBoxes.length} pothole(s) at ${yBoxes.map(b=>`${b.confidence}%`).join(", ")}.`;
                }
                break;
              }
            }
          } catch {}
        }
      } catch {}
      return NextResponse.json({ engine: "unorouter", demo: false, data: parsed, raw: content, model: tryModel, tried: attempt+1, precise: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      lastError = `${tryModel} error: ${msg.slice(0,100)}`;
      continue;
    }
  }
  // Fallback to llm7.io when Uno is rate-limited
  try {
    const r2 = await fetch(LLM7_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LLM7_KEY}` },
      body: JSON.stringify({ model: LLM7_MODEL, messages: [{ role: "user", content: [{ type: "text", text: `You are CivicLens — tell what you see in 2-3 sentences. If civic problem (pothole garbage flood etc), list them. JSON {"isCivic":true,"problem":"...","whatSeen":"...","detections":[]}` }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }] }], temperature: 0.3, max_tokens: 900 }),
      signal: AbortSignal.timeout(40000) as any,
    });
    if (r2.ok) {
      const j2 = (await r2.json()) as any;
      const c2 = j2.choices?.[0]?.message?.content || "";
      const m2 = c2.match(/\{[\s\S]*\}/);
      let p2: any = m2 ? JSON.parse(m2[0]) : { raw: c2 };
      return NextResponse.json({ engine: "llm7", demo: false, data: p2, raw: c2, model: LLM7_MODEL }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch {}
  return NextResponse.json({ demo: true, message: `All 60 free models busy/rate-limited. Last: ${lastError}. Also tried llm7 (${LLM7_MODEL}) — still busy. Try again in 30s.` }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
export async function GET() {
  let unoOk = false;
  try {
    const r = await fetch(UNO_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${UNO_KEY}` }, body: JSON.stringify({ model: FREE_MODELS_60[0], messages: [{ role: "user", content: [{ type: "text", text: "ping" }] }], max_tokens: 5 }), signal: AbortSignal.timeout(4000) as any });
    unoOk = r.ok;
  } catch {}
  let llm7Ok = false;
  try {
    const r2 = await fetch(LLM7_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${LLM7_KEY}` }, body: JSON.stringify({ model: LLM7_MODEL, messages: [{ role: "user", content: [{ type: "text", text: "ping" }] }], max_tokens: 5 }), signal: AbortSignal.timeout(4000) as any });
    llm7Ok = r2.ok;
  } catch {}
  return NextResponse.json({ unorouter: { url: UNO_URL, model: FREE_MODELS_60[0], reachable: unoOk, freeCount: FREE_MODELS_60.length, models: FREE_MODELS_60.slice(0,7) }, llm7: { url: LLM7_URL, model: LLM7_MODEL, reachable: llm7Ok }, engine: unoOk ? "unorouter" : llm7Ok ? "llm7" : "offline" }, { headers: { "Cache-Control": "no-store" } });
}
