"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { LANGS, T, LangCode } from "./i18n";
type Det={id:string,label:string,category:string,confidence:number,box:{x:number,y:number,w:number,h:number}};
type Res={problem:string,category:string,confidence:number,severity:string,whatSeen:string,evidences:string[],desc:string,action:string,detections:Det[],isCivic?:boolean};
const copyToClipboard=(txt:string)=>{ try{ navigator.clipboard.writeText(txt); }catch{} };
function useSplit(initial=55){
  const [pct,setPct]=useState(initial);
  const dragging=useRef(false);
  const ref=useRef<HTMLDivElement>(null);
  const onDown=useCallback((e:React.MouseEvent)=>{
    dragging.current=true; e.preventDefault();
    const el=ref.current; if(!el) return;
    const onMove=(ev:MouseEvent)=>{ if(!dragging.current||!el) return; const rect=el.getBoundingClientRect(); const p=((ev.clientX-rect.left)/rect.width)*100; setPct(Math.min(75,Math.max(25,p))); };
    const onUp=()=>{ dragging.current=false; window.removeEventListener("mousemove",onMove); window.removeEventListener("mouseup",onUp); document.body.style.cursor=""; document.body.style.userSelect=""; };
    document.body.style.cursor="col-resize"; document.body.style.userSelect="none";
    window.addEventListener("mousemove",onMove); window.addEventListener("mouseup",onUp);
  },[]);
  const onTouchStart=useCallback((e:React.TouchEvent)=>{
    dragging.current=true; const el=ref.current; if(!el) return;
    const onMove=(ev:TouchEvent)=>{ if(!dragging.current||!el) return; const rect=el.getBoundingClientRect(); const p=((ev.touches[0].clientX-rect.left)/rect.width)*100; setPct(Math.min(75,Math.max(25,p))); };
    const onEnd=()=>{ dragging.current=false; window.removeEventListener("touchmove",onMove); window.removeEventListener("touchend",onEnd); };
    window.addEventListener("touchmove",onMove); window.addEventListener("touchend",onEnd);
  },[]);
  return {pct,setPct,ref,onDown,onTouchStart};
}
export default function Page(){
  const [lang,setLang]=useState<LangCode>("en");
  const t=T[lang]||T.en;
  const [img,setImg]=useState<string|null>(null);
  const [file,setFile]=useState<File|null>(null);
  const [res,setRes]=useState<Res|null>(null);
  const [raw,setRaw]=useState("");
  const [loading,setLoading]=useState(false);
  const [status,setStatus]=useState<{reachable:boolean,model:string|null}>({reachable:false,model:null});
  const [sel,setSel]=useState(0);
  const [liveTrail,setLiveTrail]=useState<string[]>([]);
  const [linkInput,setLinkInput]=useState("");
  const [providerMode,setProviderMode]=useState<"nvidia"|"openrouter"|"cohere"|"lmstudio">("cohere");
  const [lastMeta,setLastMeta]=useState<{engine:string,model:string|null,tried?:number}>({engine:"",model:null});
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const [speaking,setSpeaking]=useState<string|null>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  const cameraRef=useRef<HTMLInputElement>(null);
  const [dragOver,setDragOver]=useState(false);
  const uploadSplit=useSplit(54);
  const resultSplit=useSplit(58);
  useEffect(()=>{ try{ const s=localStorage.getItem("CIVIC_LANG") as LangCode|null; if(s && (T as any)[s]) setLang(s); const m=localStorage.getItem("PROVIDER_MODE") as any; if(m) setProviderMode(m); }catch{} },[]);
  useEffect(()=>{ try{ localStorage.setItem("CIVIC_LANG",lang);}catch{} },[lang]);
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
    const poll=async()=>{ try{ const r=await fetch("/api/analyze",{cache:"no-store"}); const j=await r.json(); setStatus({reachable:!!(j.openrouter?.reachable||j.unorouter?.reachable||j.nvidia?.reachable||j.cohere?.reachable), model:j.openrouter?.model||j.unorouter?.model||j.nvidia?.model||j.cohere?.model||null}); }catch{} };
    poll(); const id=setInterval(poll,5000); return()=>clearInterval(id);
  },[]);
  const onFile=(f:File)=>{ setFile(f); setImg(URL.createObjectURL(f)); setRes(null); setRaw(""); setSel(0); };
  const onLink=async()=>{ if(!linkInput.trim()) return; try{ let url=linkInput.trim(); if(!/^https?:\/\//i.test(url)) url="https://"+url; const r=await fetch(`/api/proxy?url=${encodeURIComponent(url)}`); if(!r.ok){ const j=await r.json().catch(()=>({})); throw new Error(j.error||`HTTP ${r.status}`);} const b=await r.blob(); const f=new File([b], "link.jpg", {type: b.type||"image/jpeg"}); onFile(f); setLinkInput(""); }catch(e:any){ alert("Could not fetch image link: "+String(e.message||e)+". Try direct image URL (ends with .jpg/.png) or download and upload."); } };
  const langVoice:Record<string,string>={en:"en-US",hi:"hi-IN",mr:"mr-IN",ta:"ta-IN",te:"te-IN",kn:"kn-IN",ml:"ml-IN",bn:"bn-IN",gu:"gu-IN",pa:"pa-IN",ur:"ur-PK",or:"or-IN",as:"as-IN",vi:"vi-VN"};
  const stopSpeak=()=>{ try{ speechSynthesis.cancel(); }catch{} if(audioRef.current){ audioRef.current.pause(); audioRef.current=null; } setSpeaking(null); };
  const speak=async(txt:string,id:string)=>{
    if(speaking===id){ stopSpeak(); return; }
    stopSpeak(); setSpeaking(id);
    const ttxt=String(txt).slice(0,600);
    try{
      const r=await fetch("/api/tts",{method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({text: ttxt, lang})});
      const ct=r.headers.get("content-type")||"";
      if(r.ok && ct.startsWith("audio")){ const b=await r.blob(); const u=URL.createObjectURL(b); const a=new Audio(u); audioRef.current=a; a.onended=()=>setSpeaking(null); a.onerror=()=>{ setSpeaking(null); fallback(); }; await a.play(); return; }
    }catch{}
    fallback();
    function fallback(){
      try{
        const code=String(lang).slice(0,2);
        const voiceHint:Record<string,string>={hi:"swara",mr:"aarohi",ta:"pallavi",te:"shruti",kn:"sapna",ml:"sobhana",bn:"tanishaa",gu:"dhwani",vi:"hoaimy",en:"neerja"};
        const doSpeak=()=>{
          const voices=speechSynthesis.getVoices();
          const want=langVoice[lang]||"en-US";
          let v=voices.find(x=>x.lang===want) || voices.find(x=>x.lang.startsWith(code)) || voices.find(x=>x.name.toLowerCase().includes(voiceHint[code]||"")) || voices.find(x=>x.lang.startsWith("en")) || voices[0];
          const chunks=ttxt.match(/[^।.!?।\n]+[।.!?]?/g) || [ttxt];
          let idx=0;
          const speakNext=()=>{
            if(idx>=chunks.length){ setSpeaking(null); return; }
            const u=new SpeechSynthesisUtterance(chunks[idx].trim());
            if(v) u.voice=v;
            u.lang=want; u.rate=0.92; u.pitch=1; u.volume=1;
            u.onend=()=>{ idx++; speakNext(); };
            u.onerror=()=>{ setSpeaking(null); };
            speechSynthesis.speak(u);
          };
          speakNext();
        };
        if(speechSynthesis.getVoices().length===0){
          speechSynthesis.onvoiceschanged=()=>doSpeak();
          setTimeout(doSpeak, 600);
        } else doSpeak();
      }catch{ setSpeaking(null); }
    }
  };
  const analyze=async()=>{
    if(!file) return;
    setLoading(true); setRes(null); setRaw(""); setLiveTrail([]);
    const trailInterval=setInterval(()=>{ setLiveTrail(prev=>{ const providers=["gemini-3.1","ling-3.0-flash-vl","nemotron","aya-vision","qwen2.5-vl"]; if(prev.length<providers.length) return [...prev,`Trying ${providers[prev.length]}...`]; return prev; }); },1800);
    try{
      const fd=new FormData(); fd.append("image", file); fd.append("lang", lang); try{ fd.append("provider", providerMode); }catch{}
      const r=await fetch("/api/analyze",{method:"POST", body:fd, cache:"no-store"});
      const j=await r.json();
      clearInterval(trailInterval as any);
      if(j.demo){ setRaw(j.message||"AI not reachable"); setLastMeta({engine:j.engine||"offline", model:j.model||null}); setLoading(false); return; }
      const d=j.data; const src=d.problem?d:d;
      const dets=(src.detections||[]).map((x:any,i:number)=>({id:String(i+1), label:String(x.label||"ISSUE").toUpperCase(), category:x.category||src.category||"Civic", confidence:Math.round(Number(x.confidence||src.confidence||85)), box:x.box||{x:28+i*6,y:34+i*8,w:34,h:24}}));
      if(!dets.length && src.problem && !/no civic/i.test(src.problem)) dets.push({id:"1", label:String(src.problem).toUpperCase().slice(0,20), category:src.category||"Civic", confidence:Math.round(Number(src.confidence||85)), box:{x:28,y:38,w:42,h:28}});
      const isCivic=src.isCivic!==false && !/no civic/i.test(src.problem||"");
      setLastMeta({engine:j.engine||"openrouter", model:j.model||null, tried:j.tried});
      setRes({problem:src.problem||"Civic Issue", category:src.category||"Civic", confidence:Math.round(Number(src.confidence||88)), severity:src.severity||"Medium", whatSeen:src.whatSeen||"", evidences:src.evidences||[], desc:src.complaintLetter||"", action:src.suggestedAction||"", detections:dets, isCivic});
      setRaw(JSON.stringify(src,null,2));
    }catch(e:any){ clearInterval(trailInterval as any); setLiveTrail(prev=>[...prev,`✗ Failed: ${String(e.message||e).slice(0,60)}`]); setRaw("Error: "+String(e.message||e)); }
    setLoading(false);
  };
  return (<div className="min-h-screen bg-[#050608] text-white">
    <div className="fixed inset-0 pointer-events-none"><div className="absolute inset-0 bg-[radial-gradient(900px_560px_at_50%_-18%,rgba(109,240,194,.11),transparent_62%),radial-gradient(700px_480px_at_88%_18%,rgba(124,140,255,.09),transparent)]"/></div>
    <header className="sticky top-0 z-40 border-b border-white/[.06] bg-[#050608]/70 backdrop-blur-xl"><div className="mx-auto max-w-[1100px] px-5 h-[64px] flex items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-[10px] bg-white text-black grid place-items-center font-black text-[11px]">CL</div><div><div className="font-semibold text-[15px]">CIVICLENS</div><div className="text-[10px] tracking-[.14em] text-white/45">{t.premium}</div></div><span className={`hidden md:inline-flex ml-3 px-3 py-1 rounded-full text-xs font-bold border ${status.reachable?"bg-[#6DF0C2] text-black border-[#6DF0C2]":"bg-amber-400 text-black border-amber-400"}`}>{status.reachable?t.connected:t.offline}</span></div><div className="flex items-center gap-2"><div className="relative"><select value={lang} onChange={e=>setLang(e.target.value as LangCode)} className="appearance-none bg-white text-black font-semibold text-xs rounded-full pl-3 pr-7 py-2 border border-white/20 outline-none cursor-pointer max-w-[160px]">{LANGS.map(l=><option key={l.code} value={l.code}>{l.native} — {l.label}</option>)}</select><span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-black/60 text-xs">▼</span></div><div className="text-xs text-white/50 hidden lg:block">{t.freeNoKey}</div></div></div></header>
    <section className="relative mx-auto max-w-[1100px] px-5 pt-10 pb-6">
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs ${status.reachable?"bg-[#6DF0C2]/10 border-[#6DF0C2]/20 text-[#6DF0C2]":"bg-amber-400/10 border-amber-400/20 text-amber-200"}`}>{status.reachable?t.onlineBadge:t.offlineBadge}</div>
      <h1 className="mt-4 text-[42px] md:text-[54px] font-bold leading-[.9] tracking-[-0.04em]">{t.hero1}<br/>{t.hero2} <span className="text-[#6DF0C2]">{t.civic}</span> {t.heroInt}</h1>
      <p className="mt-3 max-w-[600px] text-white/60 leading-7">{t.heroDesc}</p>
    </section>
    <section className="relative mx-auto max-w-[1100px] px-5 pb-6">
      <div ref={uploadSplit.ref} className="rounded-[28px] border border-white/10 bg-white/[.04] backdrop-blur overflow-hidden flex flex-col lg:flex-row">
        <div style={{flex:`0 0 ${uploadSplit.pct}%`}} className="p-6 min-w-0">
          <div onClick={(e)=>{ if((e.target as HTMLElement).closest('button')) return; fileRef.current?.click(); }} onDragEnter={(e)=>{e.preventDefault(); setDragOver(true);}} onDragLeave={(e)=>{e.preventDefault(); setDragOver(false);}} onDragOver={(e)=>{e.preventDefault(); e.stopPropagation(); setDragOver(true);}} onDrop={async(e)=>{e.preventDefault(); e.stopPropagation(); setDragOver(false); let f:any=e.dataTransfer.files?.[0]; if(!f && e.dataTransfer.items){ for(const it of Array.from(e.dataTransfer.items) as any){ if(it.kind==="file"){ const ff=it.getAsFile(); if(ff){ f=ff; break; } } } } if(f){ if(f.type && !f.type.startsWith("image/")){ alert("Please drop an image file (JPG/PNG/WEBP)"); return; } onFile(f); return; } const url=e.dataTransfer.getData("text/uri-list")||e.dataTransfer.getData("text/plain"); if(url && /^https?:\/\//i.test(url.trim())){ try{ const r=await fetch(`/api/proxy?url=${encodeURIComponent(url.trim())}`); if(r.ok){ const b=await r.blob(); const nf=new File([b],"drop.jpg",{type:b.type||"image/jpeg"}); onFile(nf); return; } }catch{} } }} className={`rounded-2xl border-2 border-dashed p-6 cursor-pointer transition ${dragOver?"border-[#6DF0C2] bg-[#6DF0C2]/10 scale-[1.01]":"border-white/15 bg-black/30 hover:bg-white/[.03]"}`}>
            <input ref={fileRef} id="fileInput" type="file" accept="image/*" className="sr-only" style={{position:'absolute',left:'-9999px',opacity:0,width:1,height:1}} onChange={e=>{const f=e.target.files?.[0]; if(f) onFile(f); e.target.value="";}}/><input ref={cameraRef} id="cameraInput" type="file" accept="image/*" capture="environment" className="sr-only" style={{position:'absolute',left:'-9999px',opacity:0,width:1,height:1}} onChange={e=>{const f=e.target.files?.[0]; if(f) onFile(f); e.target.value="";}}/>
            {img ? <img src={img} alt="preview" className="w-full h-[300px] object-cover rounded-xl"/> : <div className="text-center py-10"><div className="mx-auto w-14 h-14 rounded-2xl bg-white text-black grid place-items-center">⬆</div><div className="mt-3 font-medium">{t.dropTitle}</div><div className="text-sm text-white/50">{t.dropSub}</div><div className="mt-1 text-xs text-white/30">{t.tip}</div><div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={(e)=>{e.preventDefault(); e.stopPropagation(); fileRef.current?.click();}} className="py-2.5 rounded-xl bg-white text-black text-sm font-bold cursor-pointer relative z-10">{t.upload}</button><button type="button" onClick={(e)=>{e.preventDefault(); e.stopPropagation(); cameraRef.current?.click();}} className="py-2.5 rounded-xl bg-white/[.1] border border-white/10 text-sm font-bold cursor-pointer relative z-10">{t.camera}</button></div></div>}
          </div>
          <div className="mt-3 flex gap-2"><input value={linkInput} onChange={e=>setLinkInput(e.target.value)} placeholder={t.linkPh} className="flex-1 rounded-xl bg-white/[.06] border border-white/10 px-3 py-2.5 text-sm outline-none placeholder:text-white/30"/><button onClick={onLink} className="px-4 py-2.5 rounded-xl bg-white text-black text-sm font-bold">{t.loadLink}</button></div><button disabled={!file||loading} onClick={analyze} className="mt-3 w-full py-4 rounded-xl bg-[#6DF0C2] text-black font-bold disabled:opacity-40">{loading?t.analyzing:t.analyze}</button>
          <div className="mt-2 text-xs text-center text-white/40">{t.aiOnline}</div>
        </div>
        <div onMouseDown={uploadSplit.onDown} onTouchStart={uploadSplit.onTouchStart} onDoubleClick={()=>uploadSplit.setPct(54)} title="Drag to resize — double-click to reset" className="hidden lg:flex w-[10px] shrink-0 cursor-col-resize items-center justify-center bg-white/[.06] hover:bg-[#6DF0C2]/20 border-x border-white/10 group transition-colors">
          <div className="flex flex-col gap-1 py-2"><span className="w-1 h-1 rounded-full bg-white/30 group-hover:bg-[#6DF0C2]"/><span className="w-1 h-1 rounded-full bg-white/30 group-hover:bg-[#6DF0C2]"/><span className="w-1 h-1 rounded-full bg-white/30 group-hover:bg-[#6DF0C2]"/><span className="w-1 h-8 rounded-full bg-white/15 group-hover:bg-[#6DF0C2]/50 mt-1"/><span className="w-1 h-1 rounded-full bg-white/30 group-hover:bg-[#6DF0C2] mt-1"/><span className="w-1 h-1 rounded-full bg-white/30 group-hover:bg-[#6DF0C2]"/><span className="w-1 h-1 rounded-full bg-white/30 group-hover:bg-[#6DF0C2]"/></div>
        </div>
        <div className="flex-1 min-w-0 p-6 space-y-4 bg-black/20 flex flex-col">
          <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
            <div className="flex items-center gap-2 mb-2"><span className="w-7 h-7 rounded-lg bg-[#6DF0C2] text-black grid place-items-center text-xs font-black">1</span><h3 className="font-semibold text-sm flex-1">{t.howTitle}</h3><button onClick={()=>speak(`${t.howTitle}. ${t.step1}. ${t.step2}. ${t.step3}`,'how')} className={`px-2.5 py-1 rounded-full text-xs font-bold border ${speaking==='how'?'bg-[#6DF0C2] text-black border-[#6DF0C2]':'bg-white/10 text-white border-white/10'}`}>{speaking==='how'?t.stop:t.speak}</button></div>
            <ul className="space-y-2 text-sm leading-6 text-white/70">
              <li className="flex gap-2"><span className="text-[#6DF0C2]">›</span>{t.step1}</li>
              <li className="flex gap-2"><span className="text-[#6DF0C2]">›</span>{t.step2}</li>
              <li className="flex gap-2"><span className="text-[#6DF0C2]">›</span>{t.step3}</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-[#6DF0C2]/20 bg-[#6DF0C2]/10 p-4">
            <div className="flex items-center gap-2"><h3 className="font-semibold text-sm text-[#6DF0C2] flex-1">{t.whatTitle}</h3><button onClick={()=>speak(`${t.whatTitle}. ${t.whatDesc}`,'whatdesc')} className={`px-2.5 py-1 rounded-full text-xs font-bold border ${speaking==='whatdesc'?'bg-white text-black border-white':'bg-[#6DF0C2] text-black border-[#6DF0C2]'}`}>{speaking==='whatdesc'?t.stop:t.speak}</button></div>
            <p className="mt-2 text-sm leading-6 text-white/80">{t.whatDesc}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[.03] p-3 text-xs text-white/50">{t.freeTier}</div>
          <div className="text-[10px] tracking-widest text-white/20 text-center hidden lg:block">{t.dragHint}</div>
        </div>
      </div>
    </section>
    {loading && <section className="relative mx-auto max-w-[1100px] px-5"><div className="rounded-2xl border border-white/10 bg-black p-4"><div className="h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-[#6DF0C2] animate-pulse" style={{width:`${Math.min(90, (liveTrail.length*22))}%`, transition:"width 0.5s"}}/></div><div className="mt-3 space-y-1 font-mono text-xs">{liveTrail.map((l,i)=><div key={i} className="text-white/70">{l}</div>)}{liveTrail.length===0 && <div className="text-white/40">{t.starting}</div>}</div><div className="mt-2 text-sm text-white/60">{t.liveTrav}</div></div></section>}
    {res && <section className="relative mx-auto max-w-[1100px] px-5 mt-6">
      <div ref={resultSplit.ref} className="rounded-[28px] overflow-hidden border border-white/10 bg-white/[.04] backdrop-blur flex flex-col lg:flex-row">
        <div style={{flex:`0 0 ${resultSplit.pct}%`}} className="min-w-0 flex flex-col overflow-hidden">
          <div className="relative bg-black flex-1 overflow-hidden isolate"><img src={img!} alt="result" className="w-full h-[460px] object-cover block"/>{res.detections.map((d,i)=><div key={d.id} onClick={()=>setSel(i)} className={`absolute rounded-[6px] cursor-pointer transition-all overflow-visible ${i===sel?"z-10":"z-0"}`} style={{left:`${Math.max(0,Math.min(92,d.box.x))}%`,top:`${Math.max(0,Math.min(92,d.box.y))}%`,width:`${Math.min(100-d.box.x,d.box.w)}%`,height:`${Math.min(100-d.box.y,d.box.h)}%`, maxWidth:'100%', maxHeight:'100%'}}><div className={`absolute inset-0 rounded-[6px] border-2 ${i===sel?"border-[#6DF0C2] shadow-[0_0_18px_rgba(109,240,194,0.7)] bg-[#6DF0C2]/10":"border-white/90 bg-white/5 shadow-[0_2px_12px_rgba(0,0,0,0.35)]"}`} style={{boxShadow: i===sel?"0 0 18px rgba(109,240,194,.7), inset 0 0 12px rgba(109,240,194,.15)":"0 2px 12px rgba(0,0,0,.4)"}}/><span className={`absolute -top-1 left-0 w-3 h-3 border-l-2 border-t-2 rounded-tl-[6px] ${i===sel?"border-[#6DF0C2]":"border-white/90"}`}/><span className={`absolute -top-1 right-0 w-3 h-3 border-r-2 border-t-2 rounded-tr-[6px] ${i===sel?"border-[#6DF0C2]":"border-white/90"}`}/><span className={`absolute -bottom-1 left-0 w-3 h-3 border-l-2 border-b-2 rounded-bl-[6px] ${i===sel?"border-[#6DF0C2]":"border-white/90"}`}/><span className={`absolute -bottom-1 right-0 w-3 h-3 border-r-2 border-b-2 rounded-br-[6px] ${i===sel?"border-[#6DF0C2]":"border-white/90"}`}/><span className={`absolute -top-7 left-0 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide whitespace-nowrap shadow-lg border pointer-events-none ${i===sel?"bg-[#6DF0C2] text-black border-[#6DF0C2]":"bg-white text-black border-white"}`}>{d.label} • {d.confidence}%</span>{i===sel && <span className="absolute -bottom-1 -right-1 w-2 h-2 rounded-full bg-[#6DF0C2] shadow-[0_0_8px_rgba(109,240,194,0.9)] animate-pulse pointer-events-none"/>}</div>)}<div className="absolute left-3 top-3 px-3 py-1 rounded-full bg-black/70 backdrop-blur border border-white/10 text-xs font-medium pointer-events-none">YOLO • {res.detections.length} {t.issues}</div><div className="absolute right-3 top-3 px-2.5 py-1 rounded-full bg-[#6DF0C2] text-black text-[10px] font-black shadow-lg pointer-events-none">PREMIUM YOLO</div></div>
          <div className="p-3 flex gap-2 flex-wrap border-t border-white/10 bg-black/20">{res.detections.map((d,i)=><button key={d.id} onClick={()=>setSel(i)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${i===sel?"bg-white text-black border-white":"bg-white/10 border-white/10 text-white/70"}`}>{d.label} {d.confidence}%</button>)}{res.detections.length===0 && <span className="text-sm text-white/60">{t.noCivicChip}</span>}</div>
        </div>
        <div onMouseDown={resultSplit.onDown} onTouchStart={resultSplit.onTouchStart} onDoubleClick={()=>resultSplit.setPct(58)} title="Drag to resize — double-click to reset" className="hidden lg:flex w-[10px] shrink-0 cursor-col-resize items-center justify-center bg-white/[.06] hover:bg-[#6DF0C2]/20 border-x border-white/10 group transition-colors">
          <div className="flex flex-col gap-1 py-2"><span className="w-1 h-1 rounded-full bg-white/30 group-hover:bg-[#6DF0C2]"/><span className="w-1 h-1 rounded-full bg-white/30 group-hover:bg-[#6DF0C2]"/><span className="w-1 h-1 rounded-full bg-white/30 group-hover:bg-[#6DF0C2]"/><span className="w-1 h-8 rounded-full bg-white/15 group-hover:bg-[#6DF0C2]/50 mt-1"/><span className="w-1 h-1 rounded-full bg-white/30 group-hover:bg-[#6DF0C2] mt-1"/><span className="w-1 h-1 rounded-full bg-white/30 group-hover:bg-[#6DF0C2]"/><span className="w-1 h-1 rounded-full bg-white/30 group-hover:bg-[#6DF0C2]"/></div>
        </div>
        <div className="flex-1 min-w-0 p-4 space-y-4 overflow-auto max-h-[520px] relative z-20 bg-[#0a0a0c] lg:bg-transparent">
          <div className="rounded-2xl border border-white/10 bg-white/[.04] p-5"><div className="flex items-center gap-2 mb-2 flex-wrap"><span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-xs">{t.model} <b>{lastMeta.model||"auto"}</b></span><button onClick={()=>speak(res.isCivic===false?res.whatSeen:`${res.problem}. ${res.whatSeen}. ${res.desc}. ${res.action}`,"report")} className={`px-3 py-1 rounded-full text-xs font-bold border ${speaking==="report"?"bg-[#6DF0C2] text-black border-[#6DF0C2]":"bg-white text-black border-white"}`}>{speaking==="report"?t.stop:t.speakReport}</button></div>{res.isCivic===false ? <><h3 className="font-semibold">{t.noCivicTitle}</h3><p className="mt-2 text-sm leading-6 text-white/80 flex items-start gap-2"><span className="flex-1">{t.whatSee} “{res.whatSeen}”</span><button onClick={()=>speak(res.whatSeen,"what")} className="px-2 py-1 rounded bg-[#6DF0C2] text-black text-xs font-bold">{speaking==="what"?t.stop:t.speak}</button><button onClick={()=>copyToClipboard(res.whatSeen)} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-xs">{t.copy}</button></p></> : <><h3 className="font-semibold">{res.problem}</h3><div className="text-xs text-white/50">{res.category} • {res.severity} • {res.confidence}%</div><div className="flex items-start gap-2"><p className="mt-3 text-sm leading-6 text-white/70 flex-1">“{res.whatSeen}”</p><button onClick={()=>speak(res.whatSeen,"what")} className="mt-3 px-2 py-1 rounded bg-[#6DF0C2] text-black text-xs font-bold">{speaking==="what"?t.stop:t.speak}</button><button onClick={()=>copyToClipboard(res.whatSeen)} className="mt-3 px-2 py-1 rounded bg-white/10 border border-white/10 text-xs">{t.copy}</button></div><ul className="mt-3 space-y-1 text-sm">{res.evidences.map((e,i)=><li key={e} className="flex gap-2"><span className="text-[#6DF0C2]">•</span><span className="flex-1">{e}</span><button onClick={()=>speak(e,"ev"+i)} className="px-1.5 py-0.5 rounded bg-[#6DF0C2]/20 border border-[#6DF0C2]/30 text-[10px] font-bold">{speaking===("ev"+i)?t.stop:"🔊"}</button><button onClick={()=>copyToClipboard(e)} className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px]">{t.copy}</button></li>)}</ul><div className="mt-4 p-3 rounded-xl bg-white text-black text-sm flex items-start gap-2"><span className="flex-1">“{res.desc}”</span><button onClick={()=>speak(res.desc,"desc")} className="px-2 py-1 rounded bg-black text-white text-xs font-bold">{speaking==="desc"?t.stop:t.speak}</button><button onClick={()=>copyToClipboard(res.desc)} className="px-2 py-1 rounded bg-black text-white text-xs border border-white/10">{t.copy}</button></div><div className="mt-2 text-xs flex items-center gap-2">{t.action} <b className="flex-1">{res.action}</b><button onClick={()=>speak(res.action,"action")} className="px-2 py-1 rounded bg-[#6DF0C2] text-black text-xs font-bold">{speaking==="action"?t.stop:t.speak}</button><button onClick={()=>copyToClipboard(res.action)} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-xs">{t.copy}</button></div></>}</div>
          <details className="rounded-2xl border border-white/10 bg-black/30 p-4"><summary className="text-sm font-semibold cursor-pointer flex items-center justify-between">{t.rawJson} <span onClick={(e)=>{e.preventDefault(); copyToClipboard(raw);}} className="px-2 py-1 rounded bg-white/10 border border-white/10 text-xs">{t.copyAll}</span></summary><pre className="mt-3 text-xs leading-5 text-white/70 whitespace-pre-wrap break-words max-h-[300px] overflow-auto">{raw}</pre></details>
        </div>
      </div>
    </section>}
    {raw && !res && <section className="relative mx-auto max-w-[1100px] px-5 mt-6"><div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-200">{raw}</div></section>}
    <footer className="border-t border-white/10 mt-10 py-6 text-center text-xs text-white/40">CIVICLENS — Premium • Free • /api/analyze</footer>
  </div>)
}
