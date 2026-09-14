import { NextRequest, NextResponse } from "next/server";
const PROVIDERS = [
  { name: "qwen", url: "https://api.unorouter.com/v1/chat/completions", key: process.env.UNO_API_KEY || "UNO_KEY_PLACEHOLDER", models: ["qwen2.5-vl-7b-instruct-awq:free"] },
  { name: "xkiro", url: "https://api.xkiro.com/v1/chat/completions", key: process.env.XKIRO_API_KEY || "", models: ["mistralai/mistral-large-2512","mistralai/mistral-medium-3.5","mistralai/mistral-small-2603","qwen/qwen3.5-flash:free","qwen/qwen3.5-plus:free","qwen/qwen3.8-max:free","qwen/qwen3-vl-plus:free","qwen/qwen3.7-plus:free","qwen/qwen3.6-plus:free","qwen/qwen3-max:free","qwen/qwen3.5-omni-plus:free","sensenova/sensenova-6.7-flash-lite","sensenova/sensenova-6.8-flash-lite","minimax/minimax-m3:free"] },
];
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ demo: true, message: "No image" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const file = form.get("image") as Blob | null;
  if (!file) return NextResponse.json({ demo: true, message: "No image" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const langRaw = String(form.get("lang")||"en").slice(0,5).toLowerCase();
  const langMap:Record<string,string>={en:"English",hi:"Hindi",mr:"Marathi",ta:"Tamil",te:"Telugu",kn:"Kannada",ml:"Malayalam",bn:"Bengali",gu:"Gujarati",pa:"Punjabi",ur:"Urdu",or:"Odia",as:"Assamese",vi:"Vietnamese"};
  const targetLang = langMap[langRaw]||langMap[langRaw.slice(0,2)]||"English";
  const buf = Buffer.from(await file.arrayBuffer());
  const b64 = buf.toString("base64");
   const prompt = `You are CivicLens PREMIUM YOLO — municipal civic intelligence with accurate detection. Analyze the image precisely. RequestId:${Date.now()}
Language: Respond ENTIRELY in ${targetLang}. All JSON string values (problem, category, whatSeen, evidences, complaintLetter, suggestedAction, detections[].label) MUST be in ${targetLang}. If ${targetLang} is Hindi/Marathi/etc use Devanagari/native script correctly.
Style: ALL text must be CLEAR, PRECISE, FORMAL tone. No slang, no emojis, no filler. Be concise and official. YOLO boxes must be PREMIUM, TIGHT, ACCURATE — normalized 0-100, x/y top-left, w/h size, tightly enclosing each problem with no extra margin.
Respond ONLY valid JSON:
{"isCivic":true,"problem":"Pothole + Garbage or No civic issue (in ${targetLang})","category":"Road Infrastructure|Waste Management|Water & Drainage|Infrastructure|Air Quality|No Issue (translate to ${targetLang})","confidence":0-100,"severity":"Low|Medium|High (translate to ${targetLang})","whatSeen":"2-3 FORMAL, PRECISE sentences in ${targetLang} describing exactly what is visible — clear objective observation","evidences":["precise formal bullet 1 in ${targetLang}","precise formal bullet 2 in ${targetLang}"],"complaintLetter":"FORMAL TONE paragraph in ${targetLang} — clear and precise official petition if civic else empty. Example style (translate concept to ${targetLang}, keep formal petition): 'Tôi xin báo cáo tình trạng ngập lụt nghiêm trọng tại khu vực này, gây ảnh hưởng nghiêm trọng đến an toàn và sinh hoạt của cư dân. Ngoài ra, việc thải rác bừa bãi và hệ thống thoát nước kém hiệu quả đã làm trầm trọng thêm tình trạng ngập, đe dọa đến môi trường và an toàn giao thông. Tôi khẩn cầu các cơ quan chức năng xem xét và khắc phục triệt để vấn đề này để bảo vệ cộng đồng và cải thiện chất lượng cuộc sống cho người dân.' Must be respectful, precise, formal — state location, observed issue, impact, and respectful request for remediation — ALL IN ${targetLang}.","suggestedAction":"formal precise recommended action in ${targetLang}","detections":[{"label":"POTHOLE (in ${targetLang} caps)","category":"Road Infrastructure (in ${targetLang})","confidence":92,"box":{"x":28,"y":38,"w":34,"h":26}}]}
Rules:
- isCivic=true if any civic problem else false. If false, detections=[] and problem="No civic issue" translated to ${targetLang} and complaintLetter="".
- complaintLetter MUST be formal, clear, precise, 3-4 sentences, respectful petition tone, NO casual language, IN ${targetLang}.
- whatSeen, evidences, suggestedAction also formal and precise IN ${targetLang}.
- Never leave whatSeen empty. Always ${targetLang}.
`;
  let lastError = "";
  // Retry qwen until it responds (as requested)
  const maxRetries = 6;
  for (let retry=0; retry<maxRetries; retry++) {
  for (const prov of PROVIDERS) {
    if (!prov.key || prov.key.includes("PLACEHOLDER")) { lastError = `${prov.name}: API key not set on server — add it in .env.local locally or Vercel env vars`; continue; }
    for (const tryModel of prov.models) {
      try {
        const headers: Record<string,string> = { "Content-Type": "application/json", "Authorization": `Bearer ${prov.key}` };
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
        if(!m){ lastError=`${tryModel} no JSON`; continue; }
        let parsed: any;
        try{ parsed=JSON.parse(m[0]); }catch{ lastError=`${tryModel} JSON parse fail`; continue; }
        if(!parsed || typeof parsed!=="object"){ lastError=`${tryModel} empty parse`; continue; }
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
    if (retry < maxRetries - 1) await new Promise(r=>setTimeout(r, 5000));
  }
  return NextResponse.json({ demo: true, message: `All providers busy after ${maxRetries} retries. Last: ${lastError}. Try again in 30s or start LM Studio.` }, { status: 200, headers: { "Cache-Control": "no-store" } });
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
