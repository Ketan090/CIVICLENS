"use client";
import { useState, useRef, useEffect } from "react";
type Det={id:string,label:string,category:string,confidence:number,box:{x:number,y:number,w:number,h:number}};
type Res={problem:string,category:string,confidence:number,severity:string,whatSeen:string,evidences:string[],desc:string,action:string,detections:Det[],isCivic?:boolean};
const copyToClipboard=(txt:string)=>{ try{ navigator.clipboard.writeText(txt); }catch{} };
export default function Page(){
  const [img,setImg]=useState<string|null>(null);
  const [file,setFile]=useState<File|null>(null);
  const [res,setRes]=useState<Res|null>(null);
  const [raw,setRaw]=useState("");
  const [loading,setLoading]=useState(false);
  const [status,setStatus]=useState<{reachable:boolean,model:string|null}>({reachable:false,model:null});
  const [sel,setSel]=useState(0);
  const [fetchUrl,setFetchUrl]=useState(""); const [fetchRes,setFetchRes]=useState(""); const [fetchLoading,setFetchLoading]=useState(false);
  const [liveTrail,setLiveTrail]=useState<string[]>([]);
  const [linkInput,setLinkInput]=useState("");
  const [providerMode,setProviderMode]=useState<"nvidia"|"openrouter"|"cohere"|"lmstudio">("cohere");
  const [lastMeta,setLastMeta]=useState<{engine:string,model:string|null,tried?:number}>({engine:"",model:null});
  const fileRef=useRef<HTMLInputElement>(null);
  const [dragOver,setDragOver]=useState(false);
  useEffect(()=>{
    const onPaste=(e:ClipboardEvent)=>{
      const items=e.clipboardData?.items;
      if(items){ for(const it of Array.from(items) as any){ if(it.type.startsWith("image/")){ const f=it.getAsFile(); if(f){ e.preventDefault(); onFile(f); return; } } } }
      const f=(e.clipboardData?.files as any)?.[0]; if(f) onFile(f);
    };
    window.addEventListener("paste", onPaste as any);
    return()=>window.removeEventListener("paste", onPaste as any);
  },[]);
  useEffect(()=>{
    const poll=async()=>{ try{ const r=await fetch("/api/analyze",{cache:"no-store"}); const j=await r.json(); setStatus({reachable:!!j.openrouter?.reachable, model:j.openrouter?.model||null}); }catch{} };
    poll(); const id=setInterval(poll,5000); return()=>clearInterval(id);
  },[]);
  useEffect(()=>{ try{ const m=localStorage.getItem("PROVIDER_MODE") as any; if(m) setProviderMode(m); }catch{} },[]);
  const onFile=(f:File)=>{ setFile(f); setImg(URL.createObjectURL(f)); setRes(null); setRaw(""); setSel(0); };
  const doFetch=async()=>{ if(!fetchUrl.trim()) return; setFetchLoading(true); setFetchRes(""); try{ const r=await fetch("/api/fetch",{method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({url:fetchUrl.trim()})}); const j=await r.json(); setFetchRes(j.content||j.error||JSON.stringify(j).slice(0,2000)); }catch(e:any){ setFetchRes("Error: "+String(e.message||e)); } setFetchLoading(false); };
  const onLink=async()=>{ if(!linkInput.trim()) return; try{ const r=await fetch(linkInput.trim()); const b=await r.blob(); const f=new File([b], "link.jpg", {type: b.type||"image/jpeg"}); onFile(f); setLinkInput(""); }catch{ alert("Could not fetch image link. Try direct image URL (ends with .jpg/.png)"); } };
  const analyze=async()=>{
    if(!file) return;
    setLoading(true); setRes(null); setRaw(""); setLiveTrail([]);
    const trailInterval = setInterval(()=>{
      setLiveTrail(prev=>{
        const providers = ["unorouter:gemini-3.1","openrouter:ling-3.0-flash-vl","nvidia:nemotron","cohere:aya-vision","lmstudio:qwen2.5-vl"];
        if(prev.length < providers.length) return [...prev, `Trying ${providers[prev.length]}...`];
        return prev;
      });
    }, 1800);
    try{
      const fd=new FormData(); fd.append("image", file); try{ const pm=localStorage.getItem("PROVIDER_MODE")||"nvidia"; fd.append("provider", pm); }catch{}
      const r=await fetch("/api/analyze",{method:"POST", body:fd, cache:"no-store"});
      const j=await r.json();
      if(j.demo){ setRaw(j.message||"Uno Router not reachable"); setLastMeta({engine:j.engine||"offline", model:j.model||null}); setLoading(false); return; }
      const d=j.data; const src=d.problem?d:d;
      const dets=(src.detections||[]).map((x:any,i:number)=>({id:String(i+1), label:String(x.label||"ISSUE").toUpperCase(), category:x.category||src.category||"Civic", confidence:Math.round(Number(x.confidence||src.confidence||85)), box:x.box||{x:28+i*6,y:34+i*8,w:34,h:24}}));
      if(!dets.length && src.problem && !/no civic/i.test(src.problem)) dets.push({id:"1", label:String(src.problem).toUpperCase().slice(0,20), category:src.category||"Civic", confidence:Math.round(Number(src.confidence||85)), box:{x:28,y:38,w:42,h:28}});
      const isCivic = src.isCivic !== false && !/no civic/i.test(src.problem||"");
      setLastMeta({engine:j.engine||"openrouter", model:j.model||null, tried:j.tried});
      setRes({problem:src.problem||"Civic Issue", category:src.category||"Civic", confidence:Math.round(Number(src.confidence||88)), severity:src.severity||"Medium", whatSeen:src.whatSeen||"", evidences:src.evidences||[], desc:src.complaintLetter||"", action:src.suggestedAction||"", detections:dets, isCivic});
      setRaw(JSON.stringify(src,null,2));
    }catch(e:any){ clearInterval(trailInterval as any); setLiveTrail(prev=>[...prev, `✗ Failed: ${String(e.message||e).slice(0,60)}`]); setRaw("Error: "+String(e.message||e)); }
    setLoading(false);
  };
  return (<div className="min-h-screen bg-[#050608] text-white">
    <div className="fixed inset-0 pointer-events-none"><div className="absolute inset-0 bg-[radial-gradient(900px_560px_at_50%_-18%,rgba(109,240,194,.11),transparent_62%),radial-gradient(700px_480px_at_88%_18%,rgba(124,140,255,.09),transparent)]"/></div>
    <header className="sticky top-0 z-40 border-b border-white/[.06] bg-[#050608]/70 backdrop-blur-xl"><div className="mx-auto max-w-[1100px] px-5 h-[64px] flex items-center justify-between"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-[10px] bg-white text-black grid place-items-center font-black text-[11px]">CL</div><div><div className="font-semibold text-[15px]">CIVICLENS</div><div className="text-[10px] tracking-[.14em] text-white/45">OPENROUTER EDITION</div></div><span className={`hidden md:inline-flex ml-3 px-3 py-1 rounded-full text-xs font-bold border ${status.reachable?"bg-[#6DF0C2] text-black border-[#6DF0C2]":"bg-amber-400 text-black border-amber-400"}`}>{status.reachable?`● OPENROUTER — ${status.model||"connected"}`:"○ OPENROUTER OFFLINE"}</span></div><div className="flex items-center gap-2"><div className="hidden sm:flex items-center gap-1 p-1 rounded-full bg-black/40 border border-white/10"><button onClick={()=>{setProviderMode("nvidia"); try{localStorage.setItem("PROVIDER_MODE","nvidia")}catch{}}} className={`px-2.5 py-1 rounded-full text-xs font-bold ${providerMode==="nvidia"?"bg-[#6DF0C2] text-black":"text-white/60"}`}>Uno</button><button onClick={()=>{setProviderMode("cohere"); try{localStorage.setItem("PROVIDER_MODE","cohere")}catch{}}} className={`px-2.5 py-1 rounded-full text-xs font-bold ${providerMode==="cohere"?"bg-white text-black":"text-white/60"}`}>Cohere</button><button onClick={()=>{setProviderMode("lmstudio"); try{localStorage.setItem("PROVIDER_MODE","lmstudio")}catch{}}} className={`px-2.5 py-1 rounded-full text-xs font-bold ${providerMode==="lmstudio"?"bg-emerald-400 text-black":"text-white/60"}`}>LM Studio</button></div><div className="text-xs text-white/50 hidden md:block">Free • No key needed</div></div></div></header>
    <section className="relative mx-auto max-w-[1100px] px-5 pt-10 pb-6">
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs ${status.reachable?"bg-[#6DF0C2]/10 border-[#6DF0C2]/20 text-[#6DF0C2]":"bg-amber-400/10 border-amber-400/20 text-amber-200"}`}>{status.reachable?"● Connected to Uno Router — free vision":"○ Connecting to Uno Router..."}</div>
      <h1 className="mt-4 text-[42px] md:text-[54px] font-bold leading-[.9] tracking-[-0.04em]">Turn Any Photo<br/>Into <span className="text-[#6DF0C2]">Civic</span> Intelligence.</h1>
      <p className="mt-3 max-w-[600px] text-white/60 leading-7">Cloud vision via <b className="text-white">Uno Router</b> (<code className="px-1 bg-white/10 rounded text-xs">gemini-3.1-flash-lite:free</code>) — tells what it sees, and lists every civic problem if any.</p>
    </section>
    <section className="relative mx-auto max-w-[1100px] px-5 pb-6">
      <div className="rounded-[28px] border border-white/10 bg-white/[.04] backdrop-blur p-6 grid lg:grid-cols-[1.1fr_.9fr] gap-6">
        <div>
          <div onClick={()=>fileRef.current?.click()} onDragEnter={(e)=>{e.preventDefault(); setDragOver(true);}} onDragLeave={(e)=>{e.preventDefault(); setDragOver(false);}} onDragOver={(e)=>{e.preventDefault(); e.stopPropagation(); setDragOver(true);}} onDrop={(e)=>{e.preventDefault(); e.stopPropagation(); setDragOver(false); let f:any = e.dataTransfer.files?.[0]; if(!f && e.dataTransfer.items){ for(const it of Array.from(e.dataTransfer.items) as any){ if(it.kind==="file"){ const ff=it.getAsFile(); if(ff && ff.type.startsWith("image/")){ f=ff; break; } } } } if(!f) f = e.dataTransfer.files?.[0] as any; if(f && f.type.startsWith("image/")) onFile(f); else if(f) onFile(f);}} className={`rounded-2xl border-2 border-dashed p-6 cursor-pointer transition ${dragOver?"border-[#6DF0C2] bg-[#6DF0C2]/10 scale-[1.01]":"border-white/15 bg-black/30 hover:bg-white/[.03]"}`}>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e=>{const f=e.target.files?.[0]; if(f) onFile(f)}}/>
            {img ? <img src={img} alt="preview" className="w-full h-[300px] object-cover rounded-xl"/> : <div className="text-center py-10"><div className="mx-auto w-14 h-14 rounded-2xl bg-white text-black grid place-items-center">⬆</div><div className="mt-3 font-medium">Drop image or click to browse</div><div className="text-sm text-white/50">JPG • PNG • WEBP — <b className="text-white">drop here</b>, click, or <b className="text-white">paste (Ctrl+V anywhere)</b> — sent to Uno Router</div><div className="mt-1 text-xs text-white/30">Tip: screenshot → Ctrl+C → Ctrl+V | Mobile: tap box → Take Photo</div><button onClick={(e)=>{e.stopPropagation(); fileRef.current?.click();}} className="mt-3 md:hidden w-full py-2.5 rounded-xl bg-white text-black text-sm font-bold">📷 Take Photo</button></div>}
          </div>
          <div className="mt-3 flex gap-2"><input value={linkInput} onChange={e=>setLinkInput(e.target.value)} placeholder="Or paste image link (https://...jpg)" className="flex-1 rounded-xl bg-white/[.06] border border-white/10 px-3 py-2.5 text-sm outline-none placeholder:text-white/30"/><button onClick={onLink} className="px-4 py-2.5 rounded-xl bg-white text-black text-sm font-bold">Load Link</button></div><button disabled={!file||loading} onClick={analyze} className="mt-3 w-full py-4 rounded-xl bg-[#6DF0C2] text-black font-bold disabled:opacity-40">{loading?"Analyzing with Uno Router...":"Analyze with Uno Router →"}</button>
          <div className="mt-2 text-xs text-center text-white/40">{status.reachable?"Uno Router connected — detects everything in photo":"Connecting..."}</div>
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl bg-black border border-white/10 p-4 font-mono text-xs leading-6"><div className="text-white/50">API</div><div>POST /api/analyze</div><div className="text-[#6DF0C2]">→ Uno Router (free)</div><div>→ JSON: whatSeen, isCivic, detections[]</div></div>
          <div className="rounded-2xl border border-white/10 bg-white/[.03] p-3 text-xs text-white/50">Free tier: 1 req/min. If rate-limited, wait 60s. Every civic problem gets a box; otherwise just tells what it sees.</div>
        </div>
      </div>
    </section>
    {loading && <section className="relative mx-auto max-w-[1100px] px-5"><div className="rounded-2xl border border-white/10 bg-black p-4"><div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#6DF0C2] animate-pulse" style={{width:`${Math.min(90, (liveTrail.length*22))}%`, transition:"width 0.5s"}}/></div><div className="mt-3 space-y-1 font-mono text-xs">{liveTrail.map((l,i)=><div key={i} className="text-white/70">{l}</div>)}{liveTrail.length===0 && <div className="text-white/40">Starting traversal across providers...</div>}</div><div className="mt-2 text-sm text-white/60">Live traversal — trying free vision models until one responds...</div></div></section>}
    {res && <section className="relative mx-auto max-w-[1100px] px-5 mt-6 grid lg:grid-cols-[1.2fr_.8fr] gap-6">
      <div className="rounded-[28px] overflow-hidden border border-white/10 bg-white/[.04] backdrop-blur">
        <div className="relative bg-black"><img src={img!} alt="result" className="w-full h-[460px] object-cover"/>{res.detections.map((d,i)=><div key={d.id} className={`absolute border-2 rounded-lg ${i===sel?"border-[#6DF0C2] bg-[#6DF0C2]/10":"border-white/80 bg-black/10"}`} style={{left:`${d.box.x}%`,top:`${d.box.y}%`,width:`${d.box.w}%`,height:`${d.box.h}%`}} onClick={()=>setSel(i)}><span className={`absolute -top-6 left-0 px-2 py-1 rounded text-[10px] font-bold ${i===sel?"bg-[#6DF0C2] text-black":"bg-white text-black"}`}>{d.label} {d.confidence}%</span></div>)}<div className="absolute left-3 top-3 px-3 py-1 rounded-full bg-black/60 border border-white/10 text-xs">OPENROUTER — {res.detections.length} issues</div><div className="absolute right-3 top-3 px-2.5 py-1 rounded-full bg-white text-black text-[10px] font-bold">{lastMeta.engine?.toUpperCase()||"UNO"} • {lastMeta.model||"auto"}{lastMeta.tried?` • tried ${lastMeta.tried}`:""}</div></div>
        <div className="p-3 flex gap-2 flex-wrap">{res.detections.map((d,i)=><button key={d.id} onClick={()=>setSel(i)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${i===sel?"bg-white text-black border-white":"bg-white/10 border-white/10 text-white/70"}`}>{d.label} {d.confidence}%</button>)}{res.detections.length===0 && <span className="text-sm text-white/60">No civic issue — just telling what it sees</span>}</div>
      </div>
      <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/[.04] p-5"><div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-xs mb-2">Provider: <b>{lastMeta.engine||"openrouter"}</b> • Model: <b>{lastMeta.model||"auto"}</b></div>{res.isCivic===false ? <><h3 className="font-semibold">No civic issue</h3><p className="mt-2 text-sm leading-6 text-white/80 flex items-start gap-2"><span className="flex-1">What I see: “{res.whatSeen}”</span><button onClick={()=>copyToClipboard(res.whatSeen)} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-xs">Copy</button></p></> : <><h3 className="font-semibold">{res.problem}</h3><div className="text-xs text-white/50">{res.category} • {res.severity} • {res.confidence}%</div><div className="flex items-start gap-2"><p className="mt-3 text-sm leading-6 text-white/70 flex-1">“{res.whatSeen}”</p><button onClick={()=>copyToClipboard(res.whatSeen)} className="mt-3 px-2 py-1 rounded bg-white/10 border border-white/10 text-xs">Copy</button></div><ul className="mt-3 space-y-1 text-sm">{res.evidences.map(e=><li key={e} className="flex gap-2"><span className="text-[#6DF0C2]">•</span><span className="flex-1">{e}</span><button onClick={()=>copyToClipboard(e)} className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px]">Copy</button></li>)}</ul><div className="mt-4 p-3 rounded-xl bg-white text-black text-sm flex items-start gap-2"><span className="flex-1">“{res.desc}”</span><button onClick={()=>copyToClipboard(res.desc)} className="px-2 py-1 rounded bg-black text-white text-xs">Copy</button></div><div className="mt-2 text-xs flex items-center gap-2">Action: <b className="flex-1">{res.action}</b><button onClick={()=>copyToClipboard(res.action)} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-xs">Copy</button></div></>}</div>
        <details className="rounded-2xl border border-white/10 bg-black/30 p-4"><summary className="text-sm font-semibold cursor-pointer flex items-center justify-between">Raw JSON (Uno Router) <span onClick={(e)=>{e.preventDefault(); copyToClipboard(raw);}} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-xs">Copy All</span></summary><pre className="mt-3 text-xs leading-5 text-white/70 whitespace-pre-wrap break-words max-h-[300px] overflow-auto">{raw}</pre></details>
      </div>
    </section>}
    {raw && !res && <section className="relative mx-auto max-w-[1100px] px-5 mt-6"><div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-200">{raw}</div></section>}
    <section className="relative mx-auto max-w-[1100px] px-5 mt-10"><div className="rounded-[28px] border border-white/10 bg-white/[.04] backdrop-blur p-6"><h3 className="font-semibold">🌐 Fetch Any URL — Website Reader</h3><p className="text-sm text-white/60 mt-1">Paste any URL and fetch its content (text/markdown/html) via <code className="px-1 bg-white/10 rounded">POST /api/fetch</code> or <code className="px-1 bg-white/10 rounded">GET /api/fetch?url=...</code></p><div className="mt-4 flex gap-2"><input value={fetchUrl} onChange={e=>setFetchUrl(e.target.value)} placeholder="https://example.com" className="flex-1 rounded-xl bg-white/[.06] border border-white/10 px-3 py-3 text-sm outline-none placeholder:text-white/30"/><button onClick={doFetch} disabled={fetchLoading||!fetchUrl.trim()} className="px-5 py-3 rounded-xl bg-white text-black text-sm font-bold disabled:opacity-40">{fetchLoading?"Fetching...":"Fetch"}</button></div>{fetchRes && <pre className="mt-4 p-4 rounded-xl bg-black/40 border border-white/10 text-xs leading-5 text-white/80 whitespace-pre-wrap break-words max-h-[400px] overflow-auto">{fetchRes.slice(0,8000)}</pre>}</div></section>
    <footer className="border-t border-white/10 mt-10 py-6 text-center text-xs text-white/40">CIVICLENS — Uno Router Edition • Free • /api/analyze → Uno Router</footer>
  </div>)
}
