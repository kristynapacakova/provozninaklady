'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, type Naklad } from '@/lib/supabase'
import Link from 'next/link'

const MONTHS = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec']
const CURRENT_YEAR = new Date().getFullYear()
const DPH_SAZBY = [0, 10, 12, 21]
const PRAVIDELNOST = ['měsíčně','kvartálně','pololetně','ročně','jednorázově']
const KATEGORIE = ['—','mzdy','provozní náklady','software','občerstvení','doprava','rezerva','vzdělávání','benefity']
const STAVY = ['ok','chybi','rozdil','smazat'] as const

function nextIn<T>(arr: T[], val: T): T {
  const i = arr.indexOf(val)
  return arr[(i + 1) % arr.length]
}
const KAT_COLORS: Record<string, string> = {
  'mzdy':'#534AB7','provozní náklady':'#185FA5','software':'#0F6E56',
  'občerstvení':'#854F0B','doprava':'#3B6D11','rezerva':'#6b6b67',
  'vzdělávání':'#993556','benefity':'#993C1D','—':'var(--text-tertiary)'
}

function fmt(v: number) {
  return v.toLocaleString('cs-CZ',{minimumFractionDigits:0,maximumFractionDigits:0}) + ' Kč'
}
function fmtDiff(d: number) {
  if (d === 0) return '0 Kč'
  return (d > 0 ? '+' : '') + d.toLocaleString('cs-CZ',{minimumFractionDigits:0,maximumFractionDigits:0}) + ' Kč'
}
function calcSDph(bezDph: number, sazba: number) {
  return Math.round(bezDph * (1 + sazba / 100))
}
function getStav(bezDph: number, cl: number, currentStav?: string): Naklad['stav'] {
  if (currentStav === 'smazat') return 'smazat'
  if (!cl || cl === 0) return bezDph === 0 ? 'smazat' : 'chybi'
  return bezDph === cl ? 'ok' : 'rozdil'
}

type EditingCell = { id: string; field: keyof Naklad } | null
type ModalRow = { nazev: string; ucet_bez_dph: string; dph_sazba: number; cl_bez_dph: string; pravidelnost: string; kategorie: string; stav: Naklad['stav']; poznamka: string }
const emptyModal = (): ModalRow => ({ nazev:'', ucet_bez_dph:'', dph_sazba:21, cl_bez_dph:'', pravidelnost:'měsíčně', kategorie:'—', stav:'chybi', poznamka:'' })

const STAV_CFG: Record<string, {label:string;color:string}> = {
  ok:{label:'✓ Souhlasí',color:'var(--green)'},
  chybi:{label:'✗ V CL chybí',color:'var(--red)'},
  rozdil:{label:'△ Rozdíl',color:'var(--amber)'},
  smazat:{label:'✕ Smazat z CL',color:'#993556'},
}

export default function Home() {
  const [mesic, setMesic] = useState(new Date().getMonth() + 1)
  const [rok] = useState(CURRENT_YEAR)
  const [rows, setRows] = useState<Naklad[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<EditingCell>(null)
  const [editValue, setEditValue] = useState('')
  const [filter, setFilter] = useState<'vse'|'ok'|'chybi'|'rozdil'|'smazat'>('vse')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [modalRow, setModalRow] = useState<ModalRow>(emptyModal())
  const [copying, setCopying] = useState(false)
  const [copyMsg, setCopyMsg] = useState('')
  const dragId = useRef<string|null>(null)
  const dragOverId = useRef<string|null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('naklady').select('*').eq('mesic', mesic).eq('rok', rok).order('poradi')
    setRows(data || [])
    setLoading(false)
  }, [mesic, rok])

  useEffect(() => { load() }, [load])

  async function updateField(id: string, field: keyof Naklad, value: string | number) {
    setSaving(id)
    const numericFields = ['ucet_bez_dph','cl_bez_dph','dph_sazba']
    const val = numericFields.includes(field as string) ? parseFloat(value as string) || 0 : value
    const cur = rows.find(r => r.id === id)!
    let updates: Partial<Naklad> = { [field]: val }
    if (field === 'ucet_bez_dph' || field === 'dph_sazba') {
      const sazba = field === 'dph_sazba' ? (val as number) : cur.dph_sazba
      const bezDph = field === 'ucet_bez_dph' ? (val as number) : cur.ucet_bez_dph
      updates.ucet_s_dph = calcSDph(bezDph, sazba)
    }
    // Auto-stav unless manually setting stav
    if (field !== 'stav') {
      const newBezDph = field === 'ucet_bez_dph' ? (val as number) : cur.ucet_bez_dph
      const newCl = field === 'cl_bez_dph' ? (val as number) : cur.cl_bez_dph
      if (cur.stav !== 'smazat') updates.stav = getStav(newBezDph, newCl)
    }
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r))
    await supabase.from('naklady').update(updates).eq('id', id)
    setSaving(null)
  }

  async function saveModal() {
    if (!modalRow.nazev.trim()) return
    const maxPoradi = rows.length ? Math.max(...rows.map(r => r.poradi)) + 1 : 1
    const bezDph = parseFloat(modalRow.ucet_bez_dph) || 0
    const cl = parseFloat(modalRow.cl_bez_dph) || 0
    const stav = modalRow.stav !== 'smazat' ? getStav(bezDph, cl) : 'smazat'
    const { data } = await supabase.from('naklady').insert({
      mesic, rok, nazev: modalRow.nazev.trim(),
      ucet_bez_dph: bezDph, cl_bez_dph: cl,
      ucet_s_dph: calcSDph(bezDph, modalRow.dph_sazba), cl_s_dph: 0,
      dph_sazba: modalRow.dph_sazba, pravidelnost: modalRow.pravidelnost,
      kategorie: modalRow.kategorie === '—' ? '' : modalRow.kategorie,
      stav, poznamka: modalRow.poznamka, poradi: maxPoradi
    }).select().single()
    if (data) setRows(prev => [...prev, data])
    setModalRow(emptyModal())
    setModalOpen(false)
  }

  async function deleteRow(id: string) {
    await supabase.from('naklady').delete().eq('id', id)
    setRows(prev => prev.filter(r => r.id !== id))
  }

  function startEdit(id: string, field: keyof Naklad, current: string | number) {
    setEditingCell({ id, field })
    setEditValue(String(current))
  }
  function commitEdit() {
    if (!editingCell) return
    updateField(editingCell.id, editingCell.field, editValue)
    setEditingCell(null)
  }

  function onDragStart(id: string) { dragId.current = id }
  function onDragOver(e: React.DragEvent, id: string) { e.preventDefault(); dragOverId.current = id }
  async function onDrop() {
    const fromId = dragId.current, toId = dragOverId.current
    if (!fromId || !toId || fromId === toId) return
    const newRows = [...rows]
    const fi = newRows.findIndex(r => r.id === fromId)
    const ti = newRows.findIndex(r => r.id === toId)
    const [moved] = newRows.splice(fi, 1)
    newRows.splice(ti, 0, moved)
    const updated = newRows.map((r, i) => ({ ...r, poradi: i + 1 }))
    setRows(updated)
    dragId.current = null; dragOverId.current = null
    await Promise.all(updated.map(r => supabase.from('naklady').update({ poradi: r.poradi }).eq('id', r.id)))
  }

  async function copyToMonth(targetMesic: number) {
    if (rows.length === 0) return
    setCopying(true)
    const { data: ex } = await supabase.from('naklady').select('id').eq('mesic', targetMesic).eq('rok', rok)
    if (ex && ex.length > 0) {
      setCopyMsg(`${MONTHS[targetMesic-1]} už má položky.`)
      setCopying(false); setTimeout(() => setCopyMsg(''), 3000); return
    }
    await supabase.from('naklady').insert(rows.map((r, i) => ({
      mesic: targetMesic, rok, nazev: r.nazev,
      ucet_bez_dph: r.ucet_bez_dph, cl_bez_dph: r.cl_bez_dph,
      ucet_s_dph: r.ucet_s_dph, cl_s_dph: r.cl_s_dph,
      dph_sazba: r.dph_sazba, pravidelnost: r.pravidelnost,
      kategorie: r.kategorie || '', stav: r.stav, poznamka: r.poznamka, poradi: i + 1
    })))
    setCopyMsg(`Zkopírováno do ${MONTHS[targetMesic-1]}!`)
    setCopying(false); setTimeout(() => setCopyMsg(''), 3000)
  }

  // Filtered + searched
  const filtered = rows
    .filter(r => filter === 'vse' || r.stav === filter)
    .filter(r => !search || r.nazev.toLowerCase().includes(search.toLowerCase()) || (r.kategorie||'').toLowerCase().includes(search.toLowerCase()))

  const multMap: Record<string,number> = {'měsíčně':12,'kvartálně':4,'pololetně':2,'ročně':1,'jednorázově':1}
  const totalBezDph = rows.reduce((s,r) => s + r.ucet_bez_dph, 0)
  const totalSDph = rows.reduce((s,r) => s + r.ucet_s_dph, 0)
  const totalCl = rows.reduce((s,r) => s + r.cl_bez_dph, 0)
  const totalDiff = totalBezDph - totalCl
  const totalRocneBezDph = rows.reduce((s,r) => s + r.ucet_bez_dph*(multMap[r.pravidelnost||'měsíčně']||12), 0)
  const totalRocneSDph = rows.reduce((s,r) => s + r.ucet_s_dph*(multMap[r.pravidelnost||'měsíčně']||12), 0)
  const totalRocneCl = rows.reduce((s,r) => s + r.cl_bez_dph*(multMap[r.pravidelnost||'měsíčně']||12), 0)
  const totalRocneDiff = totalRocneBezDph - totalRocneCl
  const countOk = rows.filter(r=>r.stav==='ok').length
  const countChybi = rows.filter(r=>r.stav==='chybi').length
  const countRozdil = rows.filter(r=>r.stav==='rozdil').length
  const countSmazat = rows.filter(r=>r.stav==='smazat').length

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden'}}>
      {/* Sidebar */}
      <aside style={{width:'var(--sidebar-width)',background:'var(--surface)',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',flexShrink:0,overflow:'hidden'}}>
        <div style={{padding:'20px 16px 12px',borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:28,height:28,background:'var(--accent)',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            </div>
            <span style={{fontWeight:600,fontSize:13}}>Provozní náklady</span>
          </div>
        </div>

        {/* Nav */}
        <div style={{padding:'8px 8px',borderBottom:'1px solid var(--border)'}}>
          <Link href="/dashboard" style={{textDecoration:'none',display:'block'}}>
            <div style={{padding:'6px 12px',borderRadius:6,marginBottom:2}}>
              <span style={{fontSize:13,color:'var(--text-secondary)'}}>📊 Dashboard</span>
            </div>
          </Link>
          <div style={{padding:'6px 12px',borderRadius:6,background:'var(--bg)'}}>
            <span style={{fontSize:13,fontWeight:500,color:'var(--text-primary)'}}>📋 Měsíční přehled</span>
          </div>
        </div>

        {/* Stav filter */}
        <div style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
          <div style={{padding:'0 12px 6px',fontSize:11,fontWeight:500,color:'var(--text-tertiary)',letterSpacing:'0.06em',textTransform:'uppercase'}}>Stav</div>
          {([
            {key:'vse',label:'Vše',count:rows.length,dot:null},
            {key:'ok',label:'Souhlasí',count:countOk,dot:'var(--green)'},
            {key:'chybi',label:'V CL chybí',count:countChybi,dot:'var(--red)'},
            {key:'rozdil',label:'Rozdíl',count:countRozdil,dot:'var(--amber)'},
            {key:'smazat',label:'Smazat z CL',count:countSmazat,dot:'#993556'},
          ] as const).map(({key,label,count,dot}) => (
            <button key={key} onClick={() => setFilter(key as typeof filter)} style={{
              width:'calc(100% - 8px)',display:'flex',alignItems:'center',justifyContent:'space-between',
              padding:'6px 12px',background:filter===key?'var(--bg)':'transparent',
              border:'none',borderRadius:6,margin:'1px 4px',cursor:'pointer',
              color:filter===key?'var(--text-primary)':'var(--text-secondary)',fontWeight:filter===key?500:400
            }}>
              <span style={{display:'flex',alignItems:'center',gap:7}}>
                {dot?<span style={{width:7,height:7,borderRadius:'50%',background:dot,flexShrink:0}}/>:<span style={{width:7}}/>}
                <span style={{fontSize:13}}>{label}</span>
              </span>
              <span style={{fontSize:12,color:'var(--text-tertiary)',background:'var(--bg)',padding:'1px 6px',borderRadius:4}}>{count}</span>
            </button>
          ))}
        </div>

        {/* Months */}
        <div style={{padding:'12px 0',flex:1,overflowY:'auto'}}>
          <div style={{padding:'0 12px 6px',fontSize:11,fontWeight:500,color:'var(--text-tertiary)',letterSpacing:'0.06em',textTransform:'uppercase'}}>Měsíc</div>
          {MONTHS.map((m,i) => (
            <button key={i} onClick={() => setMesic(i+1)} style={{
              width:'calc(100% - 8px)',display:'flex',alignItems:'center',justifyContent:'space-between',
              padding:'6px 12px',background:mesic===i+1?'var(--bg)':'transparent',
              border:'none',borderRadius:6,margin:'1px 4px',cursor:'pointer',
              color:mesic===i+1?'var(--text-primary)':'var(--text-secondary)',
              fontWeight:mesic===i+1?500:400,fontSize:13
            }}>
              {m}
              {mesic===i+1&&<span style={{fontSize:11,color:'var(--text-tertiary)'}}>{rok}</span>}
            </button>
          ))}
        </div>

        {/* Copy */}
        <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)'}}>
          <div style={{fontSize:11,fontWeight:500,color:'var(--text-tertiary)',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:8}}>Kopírovat do měsíce</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
            {MONTHS.map((m,i) => i+1!==mesic&&(
              <button key={i} onClick={() => copyToMonth(i+1)} disabled={copying} style={{padding:'3px 8px',fontSize:11,borderRadius:4,border:'1px solid var(--border)',background:'transparent',cursor:'pointer',color:'var(--text-secondary)'}}>{m.slice(0,3)}</button>
            ))}
          </div>
          {copyMsg&&<div style={{marginTop:8,fontSize:12,color:'var(--green)'}}>{copyMsg}</div>}
        </div>
      </aside>

      {/* Main */}
      <main style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{padding:'20px 28px 0',borderBottom:'1px solid var(--border)',background:'var(--surface)'}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
            <div>
              <h1 style={{fontSize:22,fontWeight:600,color:'var(--text-primary)',marginBottom:2}}>Provozní náklady — {MONTHS[mesic-1]} {rok}</h1>
              <p style={{fontSize:13,color:'var(--text-secondary)'}}>Reálné platby z účtu · Cash flow pohled</p>
            </div>
            <button onClick={() => setModalOpen(true)} style={{
              display:'flex',alignItems:'center',gap:6,padding:'8px 14px',
              background:'var(--accent)',color:'var(--accent-text)',border:'none',borderRadius:8,fontWeight:500,fontSize:13
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Přidat položku
            </button>
          </div>

          {/* Summary cards */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10,paddingBottom:20}}>
            {[
              {label:'Náklady / měsíc',val:fmt(totalBezDph),sub:fmt(totalSDph)+' s DPH',bg:'var(--surface)',bc:'var(--border)',tc:'var(--text-tertiary)',vc:'var(--text-primary)'},
              {label:'Náklady / rok',val:fmt(totalRocneBezDph),sub:fmt(totalRocneSDph)+' s DPH',bg:'var(--surface)',bc:'var(--border)',tc:'var(--text-tertiary)',vc:'var(--text-primary)'},
              {label:'CL / měsíc',val:fmt(totalCl),sub:'bez DPH',bg:'#E6F1FB',bc:'#B5D4F4',tc:'#185FA5',vc:'#0C447C'},
              {label:'CL / rok',val:fmt(totalRocneCl),sub:'bez DPH',bg:'#E6F1FB',bc:'#B5D4F4',tc:'#185FA5',vc:'#0C447C'},
              {label:'Rozdíl / měsíc',val:fmtDiff(totalDiff),sub:'účet vs. CL',bg:'#FAEEDA',bc:'#FAC775',tc:'#854F0B',vc:'#633806'},
              {label:'Rozdíl / rok',val:fmtDiff(totalRocneDiff),sub:'účet vs. CL',bg:'#FAEEDA',bc:'#FAC775',tc:'#854F0B',vc:'#633806'},
            ].map((c,i) => (
              <div key={i} style={{borderRadius:8,padding:'12px 14px',background:c.bg,border:`1px solid ${c.bc}`}}>
                <div style={{fontSize:10,color:c.tc,fontWeight:500,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>{c.label}</div>
                <div style={{fontSize:17,fontWeight:600,color:c.vc}}>{c.val}</div>
                <div style={{fontSize:11,color:c.tc,marginTop:2}}>{c.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Search + Table */}
        <div style={{flex:1,overflowY:'auto',overflowX:'auto',padding:'16px 28px 28px'}}>
          {/* Search bar */}
          <div style={{marginBottom:14,display:'flex',alignItems:'center',gap:10}}>
            <div style={{position:'relative',maxWidth:320}}>
              <svg style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'var(--text-tertiary)'}} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hledat…" style={{width:'100%',padding:'7px 10px 7px 28px',border:'1px solid var(--border)',borderRadius:7,fontSize:13,outline:'none',background:'var(--surface)'}}/>
            </div>
            {search && <button onClick={() => setSearch('')} style={{fontSize:12,color:'var(--text-tertiary)',background:'none',border:'none',cursor:'pointer'}}>Smazat</button>}
            <span style={{fontSize:12,color:'var(--text-tertiary)',marginLeft:'auto'}}>{filtered.length} / {rows.length} položek</span>
          </div>

          {loading ? (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:200,color:'var(--text-tertiary)'}}>Načítám…</div>
          ) : (
            <div style={{background:'var(--surface)',borderRadius:10,border:'1px solid var(--border)',overflow:'hidden',minWidth:1050}}>
              <table style={{width:'100%',borderCollapse:'collapse',tableLayout:'fixed'}}>
                <colgroup>
                  <col style={{width:'28px'}}/>
                  <col style={{width:'15%'}}/>
                  <col style={{width:'9%'}}/>
                  <col style={{width:'9%'}}/>
                  <col style={{width:'9%'}}/>
                  <col style={{width:'6%'}}/>
                  <col style={{width:'9%'}}/>
                  <col style={{width:'9%'}}/>
                  <col style={{width:'9%'}}/>
                  <col style={{width:'10%'}}/>
                  <col style={{width:'28px'}}/>
                </colgroup>
                <thead>
                  <tr style={{borderBottom:'1px solid var(--border)',background:'#fafaf8'}}>
                    <th style={{width:28}}/>
                    {['Název','Kategorie','Pravidelnost','Cena bez DPH','DPH %','Cena s DPH','CL','Rozdíl','Stav','Poznámka'].map((l,i) => (
                      <th key={i} style={{padding:'10px 8px',textAlign:i>=3&&i<=7?'right':'left',fontSize:11,fontWeight:500,color:'var(--text-tertiary)',letterSpacing:'0.05em',textTransform:'uppercase',whiteSpace:'nowrap'}}>{l}</th>
                    ))}
                    <th style={{width:28}}/>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row,idx) => {
                    const diff = row.ucet_bez_dph - row.cl_bez_dph
                    return (
                      <tr key={row.id} draggable onDragStart={()=>onDragStart(row.id)} onDragOver={e=>onDragOver(e,row.id)} onDrop={onDrop}
                        style={{borderBottom:idx<filtered.length-1?'1px solid var(--border)':'none',background:saving===row.id?'#fafaf8':undefined}}>
                        <td style={{padding:'9px 4px',textAlign:'center',color:'var(--text-tertiary)',cursor:'grab',userSelect:'none',fontSize:14}}>⠿</td>
                        <td style={{padding:'9px 8px',overflow:'hidden'}}>
                          <EditCell isEditing={editingCell?.id===row.id&&editingCell.field==='nazev'} value={editValue} display={row.nazev||'—'} onChange={setEditValue} onStart={()=>startEdit(row.id,'nazev',row.nazev)} onCommit={commitEdit}/>
                        </td>
                        <td style={{padding:'9px 8px'}}>
                          <span onClick={()=>updateField(row.id,'kategorie',nextIn(KATEGORIE,row.kategorie||'—')==='—'?'':nextIn(KATEGORIE,row.kategorie||'—'))} title="Klikni pro změnu" style={{cursor:'pointer',fontSize:12,fontWeight:500,color:KAT_COLORS[row.kategorie||'—'],whiteSpace:'nowrap'}}>
                            {row.kategorie||'—'}
                          </span>
                        </td>
                        <td style={{padding:'9px 8px'}}>
                          <span onClick={()=>updateField(row.id,'pravidelnost',nextIn(PRAVIDELNOST,row.pravidelnost||'měsíčně'))} title="Klikni pro změnu" style={{cursor:'pointer',fontSize:12,color:'var(--text-secondary)',whiteSpace:'nowrap'}}>
                            {row.pravidelnost||'měsíčně'}
                          </span>
                        </td>
                        <NumCell row={row} field="ucet_bez_dph" editingCell={editingCell} editValue={editValue} setEditValue={setEditValue} startEdit={startEdit} commitEdit={commitEdit}/>
                        <td style={{padding:'9px 4px',textAlign:'center'}}>
                          <span onClick={()=>updateField(row.id,'dph_sazba',nextIn(DPH_SAZBY,row.dph_sazba??21))} title="Klikni pro změnu" style={{cursor:'pointer',fontSize:12,fontWeight:500,color:'var(--text-secondary)',display:'inline-block',padding:'2px 6px',borderRadius:4,border:'1px solid var(--border)',background:'var(--bg)'}}>
                            {row.dph_sazba??21} %
                          </span>
                        </td>
                        <td style={{padding:'9px 8px',textAlign:'right'}}>
                          <span style={{fontSize:13,fontWeight:500,color:row.ucet_s_dph===0?'var(--text-tertiary)':'var(--text-primary)'}}>
                            {row.ucet_s_dph===0?'—':fmt(row.ucet_s_dph)}
                          </span>
                        </td>
                        <NumCell row={row} field="cl_bez_dph" editingCell={editingCell} editValue={editValue} setEditValue={setEditValue} startEdit={startEdit} commitEdit={commitEdit} muted/>
                        <td style={{padding:'9px 8px',textAlign:'right'}}>
                          {row.cl_bez_dph===0&&row.ucet_bez_dph===0
                            ? <span style={{color:'var(--text-tertiary)',fontSize:13}}>—</span>
                            : <span style={{display:'inline-flex',alignItems:'center',fontSize:12,fontWeight:500,
                                color:diff>0?'var(--red)':diff<0?'var(--green)':'var(--text-tertiary)',
                                background:diff>0?'var(--red-bg)':diff<0?'var(--green-bg)':'transparent',
                                padding:diff!==0?'2px 6px':'0',borderRadius:5}}>
                                {diff===0?'0 Kč':(diff>0?'+':'')+diff.toLocaleString('cs-CZ',{minimumFractionDigits:0,maximumFractionDigits:0})+' Kč'}
                              </span>
                          }
                        </td>
                        <td style={{padding:'9px 8px'}}>
                          <span onClick={()=>updateField(row.id,'stav',nextIn([...STAVY],row.stav))} title="Klikni pro změnu" style={{cursor:'pointer',fontSize:12,fontWeight:500,color:STAV_CFG[row.stav]?.color||'var(--text-tertiary)',whiteSpace:'nowrap'}}>
                            {STAV_CFG[row.stav]?.label||row.stav}
                          </span>
                        </td>
                        <td style={{padding:'9px 8px',overflow:'hidden'}}>
                          <EditCell isEditing={editingCell?.id===row.id&&editingCell.field==='poznamka'} value={editValue} display={row.poznamka||<span style={{color:'var(--text-tertiary)'}}>—</span>} onChange={setEditValue} onStart={()=>startEdit(row.id,'poznamka',row.poznamka)} onCommit={commitEdit}/>
                        </td>
                        <td style={{padding:'9px 4px',textAlign:'center'}}>
                          <button onClick={()=>deleteRow(row.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-tertiary)',padding:4,borderRadius:4,opacity:0.4}} onMouseEnter={e=>(e.currentTarget.style.opacity='1')} onMouseLeave={e=>(e.currentTarget.style.opacity='0.4')}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length===0&&(
                    <tr><td colSpan={11} style={{padding:'40px',textAlign:'center',color:'var(--text-tertiary)'}}>
                      {search ? `Žádné výsledky pro "${search}"` : 'Žádné položky.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Modal pro přidání položky */}
      {modalOpen && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100}}
          onClick={e => { if(e.target===e.currentTarget){setModalOpen(false);setModalRow(emptyModal())} }}>
          <div style={{background:'var(--surface)',borderRadius:12,border:'1px solid var(--border)',width:520,maxHeight:'90vh',display:'flex',flexDirection:'column',overflow:'hidden'}}>
            <div style={{padding:'20px 24px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <h2 style={{fontSize:16,fontWeight:600}}>Přidat položku</h2>
              <button onClick={()=>{setModalOpen(false);setModalRow(emptyModal())}} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-tertiary)',fontSize:20,lineHeight:1,padding:4}}>×</button>
            </div>
            <div style={{padding:'20px 24px',overflowY:'auto',display:'flex',flexDirection:'column',gap:14}}>
              <Field label="Název">
                <input autoFocus value={modalRow.nazev} onChange={e=>setModalRow(p=>({...p,nazev:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter')saveModal()}} placeholder="Název položky…" style={inputSt}/>
              </Field>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <Field label="Kategorie">
                  <select value={modalRow.kategorie} onChange={e=>setModalRow(p=>({...p,kategorie:e.target.value}))} style={inputSt}>
                    {KATEGORIE.map(k=><option key={k} value={k}>{k}</option>)}
                  </select>
                </Field>
                <Field label="Pravidelnost">
                  <select value={modalRow.pravidelnost} onChange={e=>setModalRow(p=>({...p,pravidelnost:e.target.value}))} style={inputSt}>
                    {PRAVIDELNOST.map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 80px 1fr',gap:12,alignItems:'end'}}>
                <Field label="Cena bez DPH">
                  <input type="number" value={modalRow.ucet_bez_dph} onChange={e=>setModalRow(p=>({...p,ucet_bez_dph:e.target.value}))} placeholder="0" style={{...inputSt,textAlign:'right'}}/>
                </Field>
                <Field label="DPH %">
                  <select value={modalRow.dph_sazba} onChange={e=>setModalRow(p=>({...p,dph_sazba:parseInt(e.target.value)}))} style={inputSt}>
                    {DPH_SAZBY.map(s=><option key={s} value={s}>{s} %</option>)}
                  </select>
                </Field>
                <Field label="Cena s DPH">
                  <div style={{...inputSt,color:'var(--text-tertiary)',display:'flex',alignItems:'center',justifyContent:'flex-end'}}>
                    {modalRow.ucet_bez_dph ? fmt(calcSDph(parseFloat(modalRow.ucet_bez_dph)||0,modalRow.dph_sazba)) : '—'}
                  </div>
                </Field>
              </div>
              <Field label="CL (bez DPH)">
                <input type="number" value={modalRow.cl_bez_dph} onChange={e=>setModalRow(p=>({...p,cl_bez_dph:e.target.value}))} placeholder="0" style={{...inputSt,textAlign:'right'}}/>
              </Field>
              <Field label="Poznámka">
                <input value={modalRow.poznamka} onChange={e=>setModalRow(p=>({...p,poznamka:e.target.value}))} placeholder="Volitelná poznámka…" style={inputSt}/>
              </Field>
            </div>
            <div style={{padding:'16px 24px',borderTop:'1px solid var(--border)',display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>{setModalOpen(false);setModalRow(emptyModal())}} style={{padding:'8px 16px',background:'transparent',color:'var(--text-secondary)',border:'1px solid var(--border)',borderRadius:8,fontSize:13,cursor:'pointer'}}>Zrušit</button>
              <button onClick={saveModal} disabled={!modalRow.nazev.trim()} style={{padding:'8px 20px',background:'var(--accent)',color:'white',border:'none',borderRadius:8,fontSize:13,fontWeight:500,cursor:'pointer',opacity:modalRow.nazev.trim()?1:0.5}}>Přidat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputSt: React.CSSProperties = {
  width:'100%',padding:'8px 10px',border:'1px solid var(--border)',borderRadius:7,
  fontSize:13,outline:'none',background:'var(--bg)',fontFamily:'var(--font)'
}

function Field({label,children}:{label:string;children:React.ReactNode}) {
  return (
    <div>
      <div style={{fontSize:11,fontWeight:500,color:'var(--text-secondary)',marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</div>
      {children}
    </div>
  )
}

function NumCell({row,field,editingCell,editValue,setEditValue,startEdit,commitEdit,muted}:{
  row:Naklad;field:keyof Naklad;editingCell:EditingCell;editValue:string;muted?:boolean;
  setEditValue:(v:string)=>void;startEdit:(id:string,field:keyof Naklad,v:string|number)=>void;commitEdit:()=>void
}) {
  const isEditing = editingCell?.id===row.id&&editingCell.field===field
  const val = row[field] as number
  return (
    <td style={{padding:'9px 8px',textAlign:'right'}}>
      {isEditing
        ? <input autoFocus type="number" value={editValue} onChange={e=>setEditValue(e.target.value)} onBlur={commitEdit} onKeyDown={e=>{if(e.key==='Enter')commitEdit()}} style={{width:'100%',textAlign:'right',border:'1px solid var(--border-strong)',borderRadius:4,padding:'3px 6px',fontSize:13,background:'var(--bg)',outline:'none'}}/>
        : <span onClick={()=>startEdit(row.id,field,val)} style={{cursor:'text',fontSize:13,color:val===0?'var(--text-tertiary)':muted?'var(--text-secondary)':'var(--text-primary)'}} title="Klikni pro úpravu">{val===0?'—':fmt(val)}</span>
      }
    </td>
  )
}

function EditCell({isEditing,value,display,onChange,onStart,onCommit}:{
  isEditing:boolean;value:string;display:React.ReactNode;onChange:(v:string)=>void;onStart:()=>void;onCommit:()=>void
}) {
  return isEditing
    ? <input autoFocus type="text" value={value} onChange={e=>onChange(e.target.value)} onBlur={onCommit} onKeyDown={e=>{if(e.key==='Enter')onCommit()}} style={{width:'100%',border:'1px solid var(--border-strong)',borderRadius:4,padding:'3px 6px',fontSize:13,background:'var(--bg)',outline:'none'}}/>
    : <span onClick={onStart} style={{cursor:'text',fontSize:13}} title="Klikni pro úpravu">{display}</span>
}
