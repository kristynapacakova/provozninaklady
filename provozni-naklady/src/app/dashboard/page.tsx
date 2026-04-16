'use client'
import { useEffect, useState } from 'react'
import { supabase, type Naklad } from '@/lib/supabase'
import Link from 'next/link'

const CURRENT_YEAR = new Date().getFullYear()
const multMap: Record<string, number> = { 'měsíčně':1,'kvartálně':1/3,'pololetně':1/6,'ročně':1/12,'jednorázově':1/12 }
const KAT_COLORS: Record<string, string> = {
  'mzdy':'#6366f1','provozní náklady':'#3b82f6','software':'#10b981',
  'občerstvení':'#f59e0b','doprava':'#22c55e','rezerva':'#94a3b8',
  'vzdělávání':'#ec4899','benefity':'#f97316','ostatní':'#94a3b8'
}
const STAV_CFG: Record<string,{label:string;color:string;bg:string}> = {
  ok:{label:'Souhlasí',color:'#16a34a',bg:'#f0fdf4'},
  chybi:{label:'V CL chybí',color:'#dc2626',bg:'#fef2f2'},
  rozdil:{label:'Rozdíl',color:'#d97706',bg:'#fffbeb'},
  smazat:{label:'Smazat z CL',color:'#9333ea',bg:'#faf5ff'},
}

function fmt(v: number) {
  return v.toLocaleString('cs-CZ',{minimumFractionDigits:0,maximumFractionDigits:0}) + ' Kč'
}
function monthlyAmt(r: Naklad) { return r.ucet_bez_dph * (multMap[r.pravidelnost||'měsíčně']??1) }
function monthlyCl(r: Naklad) { return r.cl_bez_dph * (multMap[r.pravidelnost||'měsíčně']??1) }

export default function Dashboard() {
  const [rows, setRows] = useState<Naklad[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [attentionFilter, setAttentionFilter] = useState(false)

  useEffect(() => {
    supabase.from('naklady').select('*').eq('rok', CURRENT_YEAR).then(({ data }) => {
      const seen = new Map<string, Naklad>()
      ;(data||[]).sort((a,b) => b.mesic - a.mesic).forEach(r => { if (!seen.has(r.nazev)) seen.set(r.nazev, r) })
      setRows(Array.from(seen.values()))
      setLoading(false)
    })
  }, [])

  const baseFiltered = rows.filter(r => !search ||
    r.nazev.toLowerCase().includes(search.toLowerCase()) ||
    (r.kategorie||'').toLowerCase().includes(search.toLowerCase())
  )
  const filtered = attentionFilter
    ? baseFiltered.filter(r => r.stav === 'chybi' || r.stav === 'rozdil' || r.stav === 'smazat')
    : baseFiltered

  const allRows = baseFiltered
  const totalBurn = allRows.reduce((s,r) => s + monthlyAmt(r), 0)
  const totalCl = allRows.reduce((s,r) => s + monthlyCl(r), 0)
  const gap = totalBurn - totalCl
  const toClean = allRows.filter(r => r.stav === 'smazat' || r.stav === 'chybi').length
  const totalSDph = allRows.reduce((s,r) => s + r.ucet_s_dph*(multMap[r.pravidelnost||'měsíčně']??1), 0)

  const byKat: Record<string,{burn:number;cl:number;count:number}> = {}
  filtered.forEach(r => {
    const k = r.kategorie||'ostatní'
    if (!byKat[k]) byKat[k] = {burn:0,cl:0,count:0}
    byKat[k].burn += monthlyAmt(r)
    byKat[k].cl += monthlyCl(r)
    byKat[k].count++
  })
  const katEntries = Object.entries(byKat).sort((a,b) => b[1].burn - a[1].burn)
  const maxBurn = Math.max(...katEntries.map(([,v]) => v.burn), 1)

  const top5 = [...filtered].sort((a,b) => monthlyAmt(b) - monthlyAmt(a)).slice(0,5)
  const attention = allRows.filter(r => r.stav === 'smazat' || r.stav === 'chybi' || r.stav === 'rozdil')

  const gapColor = gap === 0 ? '#16a34a' : Math.abs(gap) > totalBurn*0.1 ? '#dc2626' : '#d97706'
  const gapBg = gap === 0 ? '#f0fdf4' : Math.abs(gap) > totalBurn*0.1 ? '#fef2f2' : '#fffbeb'
  const gapBorder = gap === 0 ? '#bbf7d0' : Math.abs(gap) > totalBurn*0.1 ? '#fecaca' : '#fde68a'

  const card: React.CSSProperties = {background:'#fff',borderRadius:10,border:'1px solid #e2e8f0',boxShadow:'0 1px 2px rgba(0,0,0,0.04)',padding:'14px 18px'}

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',fontFamily:'"Inter",-apple-system,sans-serif',background:'#f8fafc'}}>
      {/* Sidebar */}
      <aside style={{width:'200px',background:'#fff',borderRight:'1px solid #e2e8f0',display:'flex',flexDirection:'column',flexShrink:0}}>
        <div style={{padding:'16px 14px 12px',borderBottom:'1px solid #e2e8f0'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:26,height:26,background:'#1e293b',borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            </div>
            <span style={{fontWeight:700,fontSize:12,color:'#0f172a',lineHeight:1.3}}>Provozní<br/>náklady</span>
          </div>
        </div>
        <nav style={{padding:'8px 8px'}}>
          {[{href:'/dashboard',label:'Dashboard',icon:'◈',active:true},{href:'/',label:'Měsíční přehled',icon:'≡',active:false}].map(item=>(
            <Link key={item.href} href={item.href} style={{textDecoration:'none',display:'block',marginBottom:1}}>
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',borderRadius:7,background:item.active?'#f1f5f9':'transparent',color:item.active?'#0f172a':'#64748b',fontWeight:item.active?600:400,fontSize:12}}>
                <span style={{fontSize:13,width:14,textAlign:'center'}}>{item.icon}</span>{item.label}
              </div>
            </Link>
          ))}
        </nav>
        <div style={{marginTop:'auto',padding:'12px 14px',borderTop:'1px solid #e2e8f0'}}>
          <div style={{fontSize:11,color:'#94a3b8'}}>{CURRENT_YEAR} · {allRows.length} položek</div>
        </div>
      </aside>

      {/* Main */}
      <main style={{flex:1,overflowY:'auto',padding:'20px 24px'}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
          <div>
            <h1 style={{fontSize:18,fontWeight:700,color:'#0f172a',margin:0,letterSpacing:'-0.02em'}}>Dashboard <span style={{color:'#94a3b8',fontWeight:400,fontSize:14}}>{CURRENT_YEAR}</span></h1>
            <p style={{fontSize:11,color:'#94a3b8',margin:'2px 0 0'}}>Efektivní měsíční náklady · časové rozlišení</p>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {attentionFilter && (
              <button onClick={()=>setAttentionFilter(false)} style={{padding:'6px 12px',background:'#fef2f2',color:'#dc2626',border:'1px solid #fecaca',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer'}}>
                ✕ Zrušit filtr
              </button>
            )}
            <div style={{position:'relative'}}>
              <svg style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'#94a3b8'}} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Hledat…" style={{padding:'7px 10px 7px 28px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:12,outline:'none',background:'#fff',width:180}}/>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:200,color:'#94a3b8',fontSize:13}}>Načítám…</div>
        ) : (<>

          {/* Metric cards — kompaktní */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
            {/* Burn Rate */}
            <div style={card}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:'#6366f1',flexShrink:0}}/>
                <span style={{fontSize:10,fontWeight:600,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.07em'}}>Monthly Burn Rate</span>
              </div>
              <div style={{fontSize:20,fontWeight:700,color:'#0f172a',letterSpacing:'-0.02em',lineHeight:1}}>{fmt(totalBurn)}</div>
              <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>{fmt(totalSDph)} s DPH</div>
            </div>
            {/* CL Plan */}
            <div style={card}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:'#3b82f6',flexShrink:0}}/>
                <span style={{fontSize:10,fontWeight:600,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.07em'}}>CL Plán / měsíc</span>
              </div>
              <div style={{fontSize:20,fontWeight:700,color:'#0f172a',letterSpacing:'-0.02em',lineHeight:1}}>{fmt(totalCl)}</div>
              <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>bez DPH · Costlocker</div>
            </div>
            {/* Gap */}
            <div style={{...card,background:gapBg,border:`1px solid ${gapBorder}`}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:gapColor,flexShrink:0}}/>
                <span style={{fontSize:10,fontWeight:600,color:gapColor,textTransform:'uppercase',letterSpacing:'0.07em',opacity:0.85}}>CL Gap</span>
              </div>
              <div style={{fontSize:20,fontWeight:700,color:gapColor,letterSpacing:'-0.02em',lineHeight:1}}>{gap>0?'+':''}{fmt(gap)}</div>
              <div style={{fontSize:11,color:gapColor,marginTop:4,opacity:0.8}}>
                {gap===0?'Vše souhlasí':gap>0?'Účet > CL':'CL > Účet'}
              </div>
            </div>
            {/* K vyčištění — klikatelná */}
            <div
              onClick={() => setAttentionFilter(v => !v)}
              style={{
                ...card,
                background:toClean>0?(attentionFilter?'#fecaca':'#fef2f2'):'#f0fdf4',
                border:`1px solid ${toClean>0?'#fecaca':'#bbf7d0'}`,
                cursor:'pointer',
                transform:attentionFilter?'scale(0.98)':'scale(1)',
                transition:'transform 0.1s, box-shadow 0.1s',
                boxShadow:attentionFilter?'inset 0 1px 4px rgba(220,38,38,0.15)':'0 1px 2px rgba(0,0,0,0.04)',
              }}
              title="Klikni pro filtrování položek k vyčištění"
            >
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                <div style={{width:6,height:6,borderRadius:'50%',background:toClean>0?'#dc2626':'#16a34a',flexShrink:0}}/>
                <span style={{fontSize:10,fontWeight:600,color:toClean>0?'#dc2626':'#16a34a',textTransform:'uppercase',letterSpacing:'0.07em',opacity:0.85}}>K vyčištění {attentionFilter&&'· filtrováno'}</span>
              </div>
              <div style={{fontSize:20,fontWeight:700,color:toClean>0?'#dc2626':'#16a34a',letterSpacing:'-0.02em',lineHeight:1}}>{toClean}</div>
              <div style={{fontSize:11,color:toClean>0?'#dc2626':'#16a34a',marginTop:4,opacity:0.8}}>
                {toClean>0?'klikni pro filtr':'Vše v pořádku'}
              </div>
            </div>
          </div>

          {attentionFilter && (
            <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'8px 14px',marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:12,color:'#dc2626',fontWeight:500}}>Zobrazeny pouze položky vyžadující pozornost ({filtered.length})</span>
            </div>
          )}

          {/* Category breakdown */}
          <div style={{...card,padding:'0',marginBottom:12,overflow:'hidden'}}>
            <div style={{padding:'12px 18px',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:13,fontWeight:600,color:'#0f172a'}}>Náklady dle kategorie</span>
              <span style={{fontSize:11,color:'#94a3b8'}}>měsíční průměr · podíl z celku</span>
            </div>
            {katEntries.length === 0
              ? <div style={{padding:'24px',textAlign:'center',color:'#94a3b8',fontSize:12}}>Žádná data</div>
              : katEntries.map(([kat,vals]) => {
                const pct = (vals.burn / maxBurn) * 100
                const clPct = (vals.cl / maxBurn) * 100
                const sharePct = totalBurn > 0 ? (vals.burn/totalBurn*100) : 0
                const color = KAT_COLORS[kat]||'#94a3b8'
                return (
                  <div key={kat} style={{padding:'9px 18px',borderBottom:'1px solid #f8fafc',display:'flex',alignItems:'center',gap:12}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,width:160,flexShrink:0}}>
                      <div style={{width:8,height:8,borderRadius:2,background:color,flexShrink:0}}/>
                      <span style={{fontSize:12,fontWeight:500,color:'#1e293b',textTransform:'capitalize',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{kat}</span>
                    </div>
                    <div style={{flex:1,position:'relative'}}>
                      <div style={{height:5,background:'#f1f5f9',borderRadius:3,overflow:'hidden',position:'relative'}}>
                        <div style={{position:'absolute',left:0,top:0,height:'100%',width:`${clPct}%`,background:'#e2e8f0',borderRadius:3}}/>
                        <div style={{position:'absolute',left:0,top:0,height:'100%',width:`${pct}%`,background:color,borderRadius:3,opacity:0.85}}/>
                      </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:12,flexShrink:0}}>
                      <span style={{fontSize:11,color:'#94a3b8',background:'#f8fafc',padding:'1px 6px',borderRadius:20,fontWeight:500}}>{sharePct.toFixed(0)} %</span>
                      <span style={{fontSize:12,fontWeight:600,color:'#0f172a',minWidth:80,textAlign:'right'}}>{fmt(vals.burn)}</span>
                      <span style={{fontSize:11,color:'#94a3b8',minWidth:80,textAlign:'right'}}>CL {fmt(vals.cl)}</span>
                    </div>
                  </div>
                )
              })
            }
          </div>

          {/* Two bottom tables */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {/* Top 5 */}
            <div style={{...card,padding:0,overflow:'hidden'}}>
              <div style={{padding:'10px 16px',borderBottom:'1px solid #f1f5f9'}}>
                <span style={{fontSize:13,fontWeight:600,color:'#0f172a'}}>Top 5 nákladů</span>
                <span style={{fontSize:11,color:'#94a3b8',marginLeft:8}}>měsíční průměr</span>
              </div>
              {top5.map((r,i) => {
                const amt = monthlyAmt(r)
                const pct = totalBurn>0?(amt/totalBurn*100):0
                const color = KAT_COLORS[r.kategorie||'ostatní']||'#94a3b8'
                return (
                  <div key={r.id} style={{padding:'9px 16px',borderBottom:i<4?'1px solid #f8fafc':'none',display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:18,height:18,borderRadius:5,background:'#f1f5f9',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#64748b',flexShrink:0}}>{i+1}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:500,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.nazev}</div>
                      <div style={{display:'flex',alignItems:'center',gap:5,marginTop:3}}>
                        <div style={{height:2,width:`${Math.min(pct,100)}%`,maxWidth:80,background:color,borderRadius:2,opacity:0.8}}/>
                        <span style={{fontSize:10,color:'#94a3b8'}}>{pct.toFixed(0)} %</span>
                      </div>
                    </div>
                    <div style={{fontSize:12,fontWeight:600,color:'#0f172a',flexShrink:0}}>{fmt(amt)}</div>
                  </div>
                )
              })}
              {top5.length===0&&<div style={{padding:'24px',textAlign:'center',color:'#94a3b8',fontSize:12}}>Žádná data</div>}
            </div>

            {/* Attention */}
            <div style={{...card,padding:0,overflow:'hidden'}}>
              <div style={{padding:'10px 16px',borderBottom:'1px solid #f1f5f9',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:13,fontWeight:600,color:'#0f172a'}}>Vyžaduje pozornost</span>
                {attention.length>0&&<span style={{fontSize:11,fontWeight:600,color:'#dc2626',background:'#fef2f2',padding:'2px 8px',borderRadius:20}}>{attention.length}</span>}
              </div>
              <div style={{maxHeight:220,overflowY:'auto'}}>
                {attention.length===0
                  ? <div style={{padding:'24px',textAlign:'center',color:'#94a3b8',fontSize:12}}>✓ Vše v pořádku</div>
                  : attention.map((r,i) => {
                    const cfg = STAV_CFG[r.stav]||{label:r.stav,color:'#94a3b8',bg:'#f8fafc'}
                    return (
                      <div key={r.id} style={{padding:'9px 16px',borderBottom:i<attention.length-1?'1px solid #f8fafc':'none',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:500,color:'#1e293b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.nazev}</div>
                          <div style={{fontSize:10,color:'#94a3b8',marginTop:1}}>{r.kategorie||'—'}</div>
                        </div>
                        <span style={{fontSize:10,fontWeight:600,color:cfg.color,background:cfg.bg,padding:'2px 8px',borderRadius:20,flexShrink:0,whiteSpace:'nowrap'}}>{cfg.label}</span>
                      </div>
                    )
                  })
                }
              </div>
            </div>
          </div>

        </>)}
      </main>
    </div>
  )
}
