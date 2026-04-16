'use client'
import { useEffect, useState } from 'react'
import { supabase, type Naklad } from '@/lib/supabase'
import Link from 'next/link'

const YEAR = new Date().getFullYear()
const M: Record<string, number> = { 'měsíčně':1,'kvartálně':1/3,'pololetně':1/6,'ročně':1/12,'jednorázově':1/12 }
const KC: Record<string, string> = {
  'mzdy':'#6366f1','provozní náklady':'#3b82f6','software':'#10b981',
  'občerstvení':'#f59e0b','doprava':'#22c55e','rezerva':'#94a3b8',
  'vzdělávání':'#ec4899','benefity':'#f97316','ostatní':'#94a3b8',''  :'#cbd5e1'
}
const SC: Record<string,{icon:string;color:string;bg:string;label:string}> = {
  ok:    {icon:'✓',color:'#16a34a',bg:'#dcfce7',label:'Souhlasí'},
  chybi: {icon:'✗',color:'#dc2626',bg:'#fee2e2',label:'V CL chybí'},
  rozdil:{icon:'△',color:'#d97706',bg:'#fef3c7',label:'Rozdíl'},
  smazat:{icon:'×',color:'#9333ea',bg:'#f3e8ff',label:'Smazat z CL'},
}

const f = (v: number) => v.toLocaleString('cs-CZ',{maximumFractionDigits:0}) + ' Kč'
const ma = (r: Naklad) => r.ucet_bez_dph * (M[r.pravidelnost||'měsíčně']??1)
const mc = (r: Naklad) => r.cl_bez_dph  * (M[r.pravidelnost||'měsíčně']??1)

export default function Dashboard() {
  const [rows, setRows] = useState<Naklad[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterOn, setFilterOn] = useState(false)

  useEffect(() => {
    supabase.from('naklady').select('*').eq('rok', YEAR).then(({ data }) => {
      const seen = new Map<string, Naklad>()
      ;(data||[]).sort((a,b)=>b.mesic-a.mesic).forEach(r=>{ if(!seen.has(r.nazev)) seen.set(r.nazev,r) })
      setRows(Array.from(seen.values()))
      setLoading(false)
    })
  }, [])

  const base = rows.filter(r => !search ||
    r.nazev.toLowerCase().includes(search.toLowerCase()) ||
    (r.kategorie||'').toLowerCase().includes(search.toLowerCase())
  )

  const burn   = base.reduce((s,r)=>s+ma(r),0)
  const clTot  = base.reduce((s,r)=>s+mc(r),0)
  const gap    = burn - clTot
  const sdph   = base.reduce((s,r)=>s+r.ucet_s_dph*(M[r.pravidelnost||'měsíčně']??1),0)
  const toClean = base.filter(r=>r.stav==='chybi'||r.stav==='smazat').length

  // category breakdown
  const byK: Record<string,{burn:number;cl:number}> = {}
  base.forEach(r=>{
    const k=r.kategorie||''
    if(!byK[k])byK[k]={burn:0,cl:0}
    byK[k].burn+=ma(r); byK[k].cl+=mc(r)
  })
  const kats = Object.entries(byK).sort((a,b)=>b[1].burn-a[1].burn)
  const maxB  = Math.max(...kats.map(([,v])=>v.burn),1)

  // bottom table
  const attention = base.filter(r=>r.stav==='chybi'||r.stav==='rozdil'||r.stav==='smazat')
  const top10 = [...base].sort((a,b)=>ma(b)-ma(a)).slice(0,10)
  const tableRows = filterOn ? attention : top10

  const gC = gap===0?'#16a34a':Math.abs(gap)>burn*.1?'#dc2626':'#d97706'
  const gBg= gap===0?'#f0fdf4':Math.abs(gap)>burn*.1?'#fef2f2':'#fffbeb'
  const gBr= gap===0?'#bbf7d0':Math.abs(gap)>burn*.1?'#fecaca':'#fde68a'

  const td: React.CSSProperties = {padding:'7px 10px',fontSize:12,color:'#374151',borderBottom:'1px solid #f3f4f6',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}
  const th: React.CSSProperties = {padding:'7px 10px',fontSize:10,fontWeight:600,color:'#9ca3af',textTransform:'uppercase' as const,letterSpacing:'0.06em',background:'#f9fafb',borderBottom:'1px solid #e5e7eb',whiteSpace:'nowrap'}

  return (
    <div style={{display:'flex',height:'100vh',fontFamily:'"Inter",system-ui,sans-serif',background:'#f9fafb',overflow:'hidden'}}>

      {/* ── Sidebar ───────────────────────────────── */}
      <aside style={{width:188,background:'#fff',borderRight:'1px solid #e5e7eb',display:'flex',flexDirection:'column',flexShrink:0}}>
        <div style={{padding:'14px 14px 10px',borderBottom:'1px solid #f3f4f6'}}>
          <div style={{display:'flex',alignItems:'center',gap:7}}>
            <div style={{width:24,height:24,background:'#1d4ed8',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            </div>
            <span style={{fontSize:12,fontWeight:700,color:'#111827',lineHeight:1.3}}>Provozní<br/>náklady</span>
          </div>
        </div>
        <nav style={{padding:'6px'}}>
          {[{href:'/dashboard',label:'Dashboard',active:true},{href:'/',label:'Měsíční přehled',active:false}].map(item=>(
            <Link key={item.href} href={item.href} style={{textDecoration:'none',display:'block',marginBottom:1}}>
              <div style={{padding:'6px 10px',borderRadius:6,background:item.active?'#eff6ff':'transparent',color:item.active?'#1d4ed8':'#6b7280',fontWeight:item.active?600:400,fontSize:12,display:'flex',alignItems:'center',gap:7}}>
                <span style={{fontSize:12}}>{item.active?'◈':'≡'}</span>{item.label}
              </div>
            </Link>
          ))}
        </nav>
        <div style={{marginTop:'auto',padding:'10px 14px',borderTop:'1px solid #f3f4f6',fontSize:11,color:'#9ca3af'}}>{YEAR} · {base.length} položek</div>
      </aside>

      {/* ── Main ──────────────────────────────────── */}
      <main style={{flex:1,overflowY:'auto',padding:'16px 20px',minWidth:0}}>

        {/* Header row */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <div>
            <h1 style={{fontSize:16,fontWeight:700,color:'#111827',margin:0,letterSpacing:'-0.01em'}}>
              Dashboard <span style={{fontWeight:400,color:'#9ca3af',fontSize:13}}>{YEAR}</span>
            </h1>
            <p style={{fontSize:11,color:'#9ca3af',margin:'2px 0 0'}}>Efektivní měsíční náklady · časové rozlišení</p>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            {filterOn&&(
              <button onClick={()=>setFilterOn(false)} style={{padding:'5px 10px',background:'#f3f4f6',color:'#6b7280',border:'1px solid #e5e7eb',borderRadius:6,fontSize:11,fontWeight:500,cursor:'pointer'}}>
                ✕ Zrušit filtr
              </button>
            )}
            <div style={{position:'relative'}}>
              <svg style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:'#9ca3af'}} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Hledat…" style={{padding:'6px 10px 6px 26px',border:'1px solid #e5e7eb',borderRadius:7,fontSize:12,outline:'none',background:'#fff',width:160,color:'#111827'}}/>
            </div>
          </div>
        </div>

        {loading?(
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:200,color:'#9ca3af',fontSize:13}}>Načítám…</div>
        ):(<>

          {/* ── Metric cards ── */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:12}}>
            {[
              {dot:'#6366f1',label:'Monthly Burn Rate',main:f(burn),sub:f(sdph)+' s DPH',bg:'#fff',border:'#e5e7eb',mc:'#111827',sc:'#9ca3af',clickable:false},
              {dot:'#3b82f6',label:'CL Plán / měsíc',  main:f(clTot),sub:'bez DPH · Costlocker',bg:'#fff',border:'#e5e7eb',mc:'#111827',sc:'#9ca3af',clickable:false},
              {dot:gC,        label:'CL Gap',            main:(gap>0?'+':'')+f(gap),sub:gap===0?'Vše souhlasí':gap>0?'Účet > CL':'CL > Účet',bg:gBg,border:gBr,mc:gC,sc:gC,clickable:false},
              {dot:toClean>0?'#dc2626':'#16a34a',label:'K vyčištění',main:String(toClean),sub:toClean>0?'klikni pro filtr':'Vše v pořádku',bg:filterOn?'#fee2e2':toClean>0?'#fff5f5':'#f0fdf4',border:toClean>0?'#fca5a5':'#bbf7d0',mc:toClean>0?'#dc2626':'#16a34a',sc:toClean>0?'#dc2626':'#16a34a',clickable:true},
            ].map((c,i)=>(
              <div key={i} onClick={c.clickable?()=>setFilterOn(v=>!v):undefined} style={{background:c.bg,border:`1px solid ${c.border}`,borderRadius:9,padding:'11px 13px',cursor:c.clickable?'pointer':'default',boxShadow:c.clickable&&filterOn?'inset 0 1px 3px rgba(0,0,0,.08)':'none',transition:'box-shadow .1s'}}>
                <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:6}}>
                  <div style={{width:6,height:6,borderRadius:'50%',background:c.dot,flexShrink:0}}/>
                  <span style={{fontSize:10,fontWeight:600,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'.07em'}}>{c.label}{c.clickable&&filterOn?' · aktivní':''}</span>
                </div>
                <div style={{fontSize:18,fontWeight:700,color:c.mc,letterSpacing:'-0.02em',lineHeight:1}}>{c.main}</div>
                <div style={{fontSize:11,color:c.sc,marginTop:4,opacity:.85}}>{c.sub}</div>
              </div>
            ))}
          </div>

          {filterOn&&(
            <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:7,padding:'6px 12px',marginBottom:10,fontSize:12,color:'#dc2626',fontWeight:500}}>
              Filtr aktivní — zobrazeny položky vyžadující pozornost ({attention.length})
            </div>
          )}

          {/* ── Category grid ── */}
          <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:9,overflow:'hidden',marginBottom:10}}>
            <div style={{padding:'9px 14px',borderBottom:'1px solid #f3f4f6',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:12,fontWeight:600,color:'#111827'}}>Náklady dle kategorie</span>
              <span style={{fontSize:10,color:'#9ca3af'}}>měsíční průměr</span>
            </div>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr>
                  <th style={{...th,textAlign:'left',width:'22%'}}>Kategorie</th>
                  <th style={{...th,width:'30%'}}>Podíl</th>
                  <th style={{...th,textAlign:'right',width:'20%'}}>Průměr / měsíc</th>
                  <th style={{...th,textAlign:'right',width:'28%'}}>vs. CL plán</th>
                </tr>
              </thead>
              <tbody>
                {kats.length===0?(
                  <tr><td colSpan={4} style={{...td,textAlign:'center',color:'#9ca3af',padding:'20px'}}>Žádná data</td></tr>
                ):kats.map(([kat,v])=>{
                  const pct = v.burn/maxB*100
                  const share = burn>0?(v.burn/burn*100).toFixed(0):0
                  const col = KC[kat]||'#94a3b8'
                  const diff = v.burn - v.cl
                  return (
                    <tr key={kat} style={{borderBottom:'1px solid #f9fafb'}}>
                      <td style={{...td,textAlign:'left'}}>
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <div style={{width:8,height:8,borderRadius:2,background:col,flexShrink:0}}/>
                          <span style={{fontSize:12,fontWeight:500,color:'#1f2937',textTransform:'capitalize'}}>{kat||'ostatní'}</span>
                        </div>
                      </td>
                      <td style={{...td,padding:'7px 10px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:7}}>
                          <div style={{flex:1,height:4,background:'#f3f4f6',borderRadius:2,overflow:'hidden',maxWidth:120}}>
                            <div style={{height:'100%',width:`${pct}%`,background:col,borderRadius:2,opacity:.85}}/>
                          </div>
                          <span style={{fontSize:10,color:'#9ca3af',minWidth:28}}>{share} %</span>
                        </div>
                      </td>
                      <td style={{...td,textAlign:'right',fontWeight:600,color:'#111827'}}>{f(v.burn)}</td>
                      <td style={{...td,textAlign:'right'}}>
                        <span style={{color:'#9ca3af',fontSize:11}}>{f(v.cl)}</span>
                        {diff!==0&&<span style={{marginLeft:6,fontSize:10,fontWeight:600,color:diff>0?'#dc2626':'#16a34a'}}>{diff>0?'+':''}{f(diff)}</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ── Bottom table ── */}
          <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:9,overflow:'hidden'}}>
            <div style={{padding:'9px 14px',borderBottom:'1px solid #f3f4f6',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:12,fontWeight:600,color:'#111827'}}>
                {filterOn?`Položky k vyčištění (${attention.length})`:'Top 10 největších nákladů'}
              </span>
              <span style={{fontSize:10,color:'#9ca3af'}}>{filterOn?'filtrováno dle stavu':'měsíční průměr'}</span>
            </div>
            {tableRows.length===0?(
              <div style={{padding:'24px',textAlign:'center',color:'#9ca3af',fontSize:12}}>
                {filterOn?'✓ Žádné položky k vyčištění':'Žádná data'}
              </div>
            ):(
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr>
                    <th style={{...th,textAlign:'left',width:'4%'}}>#</th>
                    <th style={{...th,textAlign:'left',width:'30%'}}>Název</th>
                    <th style={{...th,textAlign:'left',width:'14%'}}>Kategorie</th>
                    <th style={{...th,textAlign:'left',width:'12%'}}>Pravidelnost</th>
                    <th style={{...th,textAlign:'right',width:'14%'}}>Průměr / měsíc</th>
                    <th style={{...th,textAlign:'right',width:'14%'}}>CL plán</th>
                    <th style={{...th,textAlign:'left',width:'12%'}}>Stav</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r,i)=>{
                    const amt = ma(r)
                    const s = SC[r.stav]||{icon:'?',color:'#9ca3af',bg:'#f9fafb',label:r.stav}
                    const col = KC[r.kategorie||'']||'#cbd5e1'
                    return (
                      <tr key={r.id} style={{borderBottom:i<tableRows.length-1?'1px solid #f9fafb':'none'}}>
                        <td style={{...td,color:'#9ca3af',fontWeight:600,fontSize:11}}>{i+1}</td>
                        <td style={{...td,fontWeight:500,color:'#111827',maxWidth:180}}>{r.nazev}</td>
                        <td style={{...td}}>
                          {r.kategorie&&<span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11}}>
                            <span style={{width:7,height:7,borderRadius:2,background:col,flexShrink:0,display:'inline-block'}}/>
                            <span style={{color:'#6b7280',textTransform:'capitalize'}}>{r.kategorie}</span>
                          </span>}
                          {!r.kategorie&&<span style={{color:'#d1d5db',fontSize:11}}>—</span>}
                        </td>
                        <td style={{...td,color:'#6b7280',fontSize:11}}>{r.pravidelnost||'měsíčně'}</td>
                        <td style={{...td,textAlign:'right',fontWeight:600,color:'#111827'}}>{amt>0?f(amt):'—'}</td>
                        <td style={{...td,textAlign:'right',color:'#9ca3af',fontSize:11}}>{mc(r)>0?f(mc(r)):'—'}</td>
                        <td style={{...td}}>
                          <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600,color:s.color,background:s.bg,padding:'2px 7px',borderRadius:20}}>
                            {s.icon} {s.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

        </>)}
      </main>
    </div>
  )
}
