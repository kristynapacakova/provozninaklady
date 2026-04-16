'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, type Naklad } from '@/lib/supabase'

const MONTHS = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec']
const CURRENT_YEAR = new Date().getFullYear()
const DPH_SAZBY = [0, 10, 12, 21]
const PRAVIDELNOST = ['měsíčně','kvartálně','pololetně','ročně','jednorázově']
const KATEGORIE = ['—','mzdy','provozní náklady','software','občerstvení','doprava','rezerva','vzdělávání','benefity']

function fmt(v: number) {
  return v.toLocaleString('cs-CZ', {minimumFractionDigits:0,maximumFractionDigits:0}) + ' Kč'
}
function fmtDiff(d: number) {
  if (d === 0) return '0 Kč'
  return (d > 0 ? '+' : '') + d.toLocaleString('cs-CZ', {minimumFractionDigits:0,maximumFractionDigits:0}) + ' Kč'
}
function calcSDph(bezDph: number, sazba: number) {
  return Math.round(bezDph * (1 + sazba / 100))
}
function getStav(bezDph: number, cl: number): 'ok' | 'chybi' | 'rozdil' {
  if (!cl || cl === 0) return 'chybi'
  return bezDph === cl ? 'ok' : 'rozdil'
}

type EditingCell = { id: string; field: keyof Naklad } | null
type NewRow = { nazev: string; ucet_bez_dph: string; dph_sazba: number; cl_bez_dph: string; pravidelnost: string; kategorie: string; poznamka: string }

export default function Home() {
  const [mesic, setMesic] = useState(new Date().getMonth() + 1)
  const [rok] = useState(CURRENT_YEAR)
  const [rows, setRows] = useState<Naklad[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<EditingCell>(null)
  const [editValue, setEditValue] = useState('')
  const [filter, setFilter] = useState<'vse'|'ok'|'chybi'|'rozdil'>('vse')
  const [addingRow, setAddingRow] = useState(false)
  const [newRow, setNewRow] = useState<NewRow>({ nazev:'', ucet_bez_dph:'', dph_sazba:21, cl_bez_dph:'', pravidelnost:'měsíčně', kategorie:'—', poznamka:'' })
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
    const currentRow = rows.find(r => r.id === id)!
    let updates: Partial<Naklad> = { [field]: val }
    if (field === 'ucet_bez_dph' || field === 'dph_sazba') {
      const sazba = field === 'dph_sazba' ? (val as number) : currentRow.dph_sazba
      const bezDph = field === 'ucet_bez_dph' ? (val as number) : currentRow.ucet_bez_dph
      updates.ucet_s_dph = calcSDph(bezDph, sazba)
    }
    const newBezDph = field === 'ucet_bez_dph' ? (val as number) : currentRow.ucet_bez_dph
    const newCl = field === 'cl_bez_dph' ? (val as number) : currentRow.cl_bez_dph
    updates.stav = getStav(newBezDph, newCl)
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r))
    await supabase.from('naklady').update(updates).eq('id', id)
    setSaving(null)
  }

  async function addRow() {
    if (!newRow.nazev.trim()) return
    const maxPoradi = rows.length ? Math.max(...rows.map(r => r.poradi)) + 1 : 1
    const bezDph = parseFloat(newRow.ucet_bez_dph) || 0
    const cl = parseFloat(newRow.cl_bez_dph) || 0
    const { data } = await supabase.from('naklady').insert({
      mesic, rok, nazev: newRow.nazev.trim(),
      ucet_bez_dph: bezDph, cl_bez_dph: cl,
      ucet_s_dph: calcSDph(bezDph, newRow.dph_sazba), cl_s_dph: 0,
      dph_sazba: newRow.dph_sazba, pravidelnost: newRow.pravidelnost,
      kategorie: newRow.kategorie === '—' ? '' : newRow.kategorie,
      stav: getStav(bezDph, cl), poznamka: newRow.poznamka, poradi: maxPoradi
    }).select().single()
    if (data) setRows(prev => [...prev, data])
    setNewRow({ nazev:'', ucet_bez_dph:'', dph_sazba:21, cl_bez_dph:'', pravidelnost:'měsíčně', kategorie:'—', poznamka:'' })
    setAddingRow(false)
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

  // Drag & drop
  function onDragStart(id: string) { dragId.current = id }
  function onDragOver(e: React.DragEvent, id: string) {
    e.preventDefault()
    dragOverId.current = id
  }
  async function onDrop() {
    const fromId = dragId.current
    const toId = dragOverId.current
    if (!fromId || !toId || fromId === toId) return
    const newRows = [...rows]
    const fromIdx = newRows.findIndex(r => r.id === fromId)
    const toIdx = newRows.findIndex(r => r.id === toId)
    const [moved] = newRows.splice(fromIdx, 1)
    newRows.splice(toIdx, 0, moved)
    const updated = newRows.map((r, i) => ({ ...r, poradi: i + 1 }))
    setRows(updated)
    dragId.current = null
    dragOverId.current = null
    // Persist order
    await Promise.all(updated.map(r => supabase.from('naklady').update({ poradi: r.poradi }).eq('id', r.id)))
  }

  async function copyToMonth(targetMesic: number) {
    if (rows.length === 0) return
    setCopying(true)
    const { data: existing } = await supabase.from('naklady').select('id').eq('mesic', targetMesic).eq('rok', rok)
    if (existing && existing.length > 0) {
      setCopyMsg(`${MONTHS[targetMesic-1]} už má ${existing.length} položek.`)
      setCopying(false)
      setTimeout(() => setCopyMsg(''), 4000)
      return
    }
    const toInsert = rows.map((r, i) => ({
      mesic: targetMesic, rok, nazev: r.nazev,
      ucet_bez_dph: r.ucet_bez_dph, cl_bez_dph: r.cl_bez_dph,
      ucet_s_dph: r.ucet_s_dph, cl_s_dph: r.cl_s_dph,
      dph_sazba: r.dph_sazba, pravidelnost: r.pravidelnost,
      kategorie: r.kategorie || '',
      stav: r.stav, poznamka: r.poznamka, poradi: i + 1
    }))
    await supabase.from('naklady').insert(toInsert)
    setCopyMsg(`Zkopírováno do ${MONTHS[targetMesic-1]}!`)
    setCopying(false)
    setTimeout(() => setCopyMsg(''), 3000)
  }

  const filtered = filter === 'vse' ? rows : rows.filter(r => r.stav === filter)
  const totalBezDph = rows.reduce((s,r) => s + r.ucet_bez_dph, 0)
  const totalSDph = rows.reduce((s,r) => s + r.ucet_s_dph, 0)
  const totalCl = rows.reduce((s,r) => s + r.cl_bez_dph, 0)
  const totalDiff = totalBezDph - totalCl
  const multMap: Record<string, number> = { 'měsíčně':12,'kvartálně':4,'pololetně':2,'ročně':1,'jednorázově':1 }
  const totalRocneBezDph = rows.reduce((s,r) => s + r.ucet_bez_dph*(multMap[r.pravidelnost||'měsíčně']||12), 0)
  const totalRocneSDph = rows.reduce((s,r) => s + r.ucet_s_dph*(multMap[r.pravidelnost||'měsíčně']||12), 0)
  const totalRocneCl = rows.reduce((s,r) => s + r.cl_bez_dph*(multMap[r.pravidelnost||'měsíčně']||12), 0)
  const totalRocneDiff = totalRocneBezDph - totalRocneCl
  const countOk = rows.filter(r => r.stav === 'ok').length
  const countChybi = rows.filter(r => r.stav === 'chybi').length
  const countRozdil = rows.filter(r => r.stav === 'rozdil').length

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

        <div style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
          <div style={{padding:'0 12px 6px',fontSize:11,fontWeight:500,color:'var(--text-tertiary)',letterSpacing:'0.06em',textTransform:'uppercase'}}>Stav</div>
          {([
            {key:'vse',label:'Vše',count:rows.length,dot:null},
            {key:'ok',label:'Souhlasí',count:countOk,dot:'var(--green)'},
            {key:'chybi',label:'V CL chybí',count:countChybi,dot:'var(--red)'},
            {key:'rozdil',label:'Rozdíl',count:countRozdil,dot:'var(--amber)'},
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

        <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)'}}>
          <div style={{fontSize:11,fontWeight:500,color:'var(--text-tertiary)',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:8}}>Kopírovat do měsíce</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
            {MONTHS.map((m,i) => i+1 !== mesic && (
              <button key={i} onClick={() => copyToMonth(i+1)} disabled={copying} style={{
                padding:'3px 8px',fontSize:11,borderRadius:4,border:'1px solid var(--border)',
                background:'transparent',cursor:'pointer',color:'var(--text-secondary)'
              }}>{m.slice(0,3)}</button>
            ))}
          </div>
          {copyMsg && <div style={{marginTop:8,fontSize:12,color:'var(--green)'}}>{copyMsg}</div>}
        </div>
      </aside>

      {/* Main */}
      <main style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{padding:'20px 28px 0',borderBottom:'1px solid var(--border)',background:'var(--surface)'}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
            <div>
              <h1 style={{fontSize:22,fontWeight:600,color:'var(--text-primary)',marginBottom:2}}>Provozní náklady — {MONTHS[mesic-1]} {rok}</h1>
              <p style={{fontSize:13,color:'var(--text-secondary)'}}>Porovnání plateb z účtu s položkami v Costlockeru</p>
            </div>
            <button onClick={() => setAddingRow(true)} style={{
              display:'flex',alignItems:'center',gap:6,padding:'8px 14px',
              background:'var(--accent)',color:'var(--accent-text)',border:'none',borderRadius:8,fontWeight:500,fontSize:13
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Přidat položku
            </button>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10,paddingBottom:20}}>
            <div style={{borderRadius:8,padding:'12px 14px',background:'var(--surface)',border:'1px solid var(--border)'}}>
              <div style={{fontSize:10,color:'var(--text-tertiary)',fontWeight:500,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>Náklady / měsíc</div>
              <div style={{fontSize:17,fontWeight:600,color:'var(--text-primary)'}}>{fmt(totalBezDph)}</div>
              <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2}}>{fmt(totalSDph)} s DPH</div>
            </div>
            <div style={{borderRadius:8,padding:'12px 14px',background:'var(--surface)',border:'1px solid var(--border)'}}>
              <div style={{fontSize:10,color:'var(--text-tertiary)',fontWeight:500,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>Náklady / rok</div>
              <div style={{fontSize:17,fontWeight:600,color:'var(--text-primary)'}}>{fmt(totalRocneBezDph)}</div>
              <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2}}>{fmt(totalRocneSDph)} s DPH</div>
            </div>
            <div style={{borderRadius:8,padding:'12px 14px',background:'#E6F1FB',border:'1px solid #B5D4F4'}}>
              <div style={{fontSize:10,color:'#185FA5',fontWeight:500,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>CL / měsíc</div>
              <div style={{fontSize:17,fontWeight:600,color:'#0C447C'}}>{fmt(totalCl)}</div>
              <div style={{fontSize:11,color:'#185FA5',marginTop:2}}>bez DPH</div>
            </div>
            <div style={{borderRadius:8,padding:'12px 14px',background:'#E6F1FB',border:'1px solid #B5D4F4'}}>
              <div style={{fontSize:10,color:'#185FA5',fontWeight:500,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>CL / rok</div>
              <div style={{fontSize:17,fontWeight:600,color:'#0C447C'}}>{fmt(totalRocneCl)}</div>
              <div style={{fontSize:11,color:'#185FA5',marginTop:2}}>bez DPH</div>
            </div>
            <div style={{borderRadius:8,padding:'12px 14px',background:'#FAEEDA',border:'1px solid #FAC775'}}>
              <div style={{fontSize:10,color:'#854F0B',fontWeight:500,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>Rozdíl / měsíc</div>
              <div style={{fontSize:17,fontWeight:600,color:'#633806'}}>{fmtDiff(totalDiff)}</div>
              <div style={{fontSize:11,color:'#854F0B',marginTop:2}}>účet vs. CL</div>
            </div>
            <div style={{borderRadius:8,padding:'12px 14px',background:'#FAEEDA',border:'1px solid #FAC775'}}>
              <div style={{fontSize:10,color:'#854F0B',fontWeight:500,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>Rozdíl / rok</div>
              <div style={{fontSize:17,fontWeight:600,color:'#633806'}}>{fmtDiff(totalRocneDiff)}</div>
              <div style={{fontSize:11,color:'#854F0B',marginTop:2}}>účet vs. CL</div>
            </div>
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto',overflowX:'auto',padding:'20px 28px'}}>
          {loading ? (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:200,color:'var(--text-tertiary)'}}>Načítám…</div>
          ) : (
            <div style={{background:'var(--surface)',borderRadius:10,border:'1px solid var(--border)',overflow:'hidden',minWidth:1050}}>
              <table style={{width:'100%',borderCollapse:'collapse',tableLayout:'fixed'}}>
                <colgroup>
                  <col style={{width:'28px'}}/>{/* drag handle */}
                  <col style={{width:'14%'}}/>
                  <col style={{width:'9%'}}/>
                  <col style={{width:'9%'}}/>
                  <col style={{width:'9%'}}/>
                  <col style={{width:'6%'}}/>
                  <col style={{width:'9%'}}/>
                  <col style={{width:'9%'}}/>
                  <col style={{width:'8%'}}/>
                  <col style={{width:'8%'}}/>
                  <col style={{width:'11%'}}/>
                  <col style={{width:'28px'}}/>{/* delete */}
                </colgroup>
                <thead>
                  <tr style={{borderBottom:'1px solid var(--border)',background:'#fafaf8'}}>
                    <th style={{width:28}}/>
                    {[
                      {label:'Název',align:'left'},
                      {label:'Kategorie',align:'left'},
                      {label:'Pravidelnost',align:'left'},
                      {label:'Cena bez DPH',align:'right'},
                      {label:'DPH %',align:'center'},
                      {label:'Cena s DPH',align:'right'},
                      {label:'CL',align:'right'},
                      {label:'Rozdíl',align:'right'},
                      {label:'Stav',align:'left'},
                      {label:'Poznámka',align:'left'},
                    ].map((col,i) => (
                      <th key={i} style={{padding:'10px 8px',textAlign:col.align as 'left'|'right'|'center',fontSize:11,fontWeight:500,color:'var(--text-tertiary)',letterSpacing:'0.05em',textTransform:'uppercase',whiteSpace:'nowrap',overflow:'hidden'}}>{col.label}</th>
                    ))}
                    <th style={{width:28}}/>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row,idx) => {
                    const diff = row.ucet_bez_dph - row.cl_bez_dph
                    return (
                      <tr key={row.id}
                        draggable
                        onDragStart={() => onDragStart(row.id)}
                        onDragOver={e => onDragOver(e, row.id)}
                        onDrop={onDrop}
                        style={{borderBottom:idx<filtered.length-1?'1px solid var(--border)':'none',background:saving===row.id?'#fafaf8':undefined,cursor:'default'}}
                      >
                        {/* Drag handle */}
                        <td style={{padding:'9px 4px',textAlign:'center',color:'var(--text-tertiary)',cursor:'grab',userSelect:'none',fontSize:14}}>⠿</td>
                        {/* Název */}
                        <td style={{padding:'9px 8px',overflow:'hidden'}}>
                          <EditCell isEditing={editingCell?.id===row.id&&editingCell.field==='nazev'} value={editValue} display={row.nazev||'—'} onChange={setEditValue} onStart={() => startEdit(row.id,'nazev',row.nazev)} onCommit={commitEdit}/>
                        </td>
                        {/* Kategorie */}
                        <td style={{padding:'9px 8px'}}>
                          <select value={row.kategorie||'—'} onChange={e => updateField(row.id,'kategorie',e.target.value==='—'?'':e.target.value)} style={{border:'none',background:'transparent',fontSize:12,fontFamily:'var(--font)',cursor:'pointer',outline:'none',color:'var(--text-secondary)',width:'100%'}}>
                            {KATEGORIE.map(k => <option key={k} value={k}>{k}</option>)}
                          </select>
                        </td>
                        {/* Pravidelnost */}
                        <td style={{padding:'9px 8px'}}>
                          <select value={row.pravidelnost||'měsíčně'} onChange={e => updateField(row.id,'pravidelnost',e.target.value)} style={{border:'none',background:'transparent',fontSize:12,fontFamily:'var(--font)',cursor:'pointer',outline:'none',color:'var(--text-secondary)',width:'100%'}}>
                            {PRAVIDELNOST.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </td>
                        {/* Cena bez DPH */}
                        <NumCell row={row} field="ucet_bez_dph" editingCell={editingCell} editValue={editValue} setEditValue={setEditValue} startEdit={startEdit} commitEdit={commitEdit}/>
                        {/* DPH % */}
                        <td style={{padding:'9px 4px',textAlign:'center'}}>
                          <select value={row.dph_sazba??21} onChange={e => updateField(row.id,'dph_sazba',e.target.value)} style={{border:'1px solid var(--border)',background:'var(--bg)',borderRadius:5,fontSize:11,fontFamily:'var(--font)',cursor:'pointer',outline:'none',padding:'2px 2px',color:'var(--text-primary)',fontWeight:500,width:'100%',textAlign:'center'}}>
                            {DPH_SAZBY.map(s => <option key={s} value={s}>{s}%</option>)}
                          </select>
                        </td>
                        {/* Cena s DPH */}
                        <td style={{padding:'9px 8px',textAlign:'right'}}>
                          <span style={{fontSize:13,fontWeight:500,color:row.ucet_s_dph===0?'var(--text-tertiary)':'var(--text-primary)'}}>
                            {row.ucet_s_dph===0?'—':fmt(row.ucet_s_dph)}
                          </span>
                        </td>
                        {/* CL */}
                        <NumCell row={row} field="cl_bez_dph" editingCell={editingCell} editValue={editValue} setEditValue={setEditValue} startEdit={startEdit} commitEdit={commitEdit} muted/>
                        {/* Rozdíl */}
                        <td style={{padding:'9px 8px',textAlign:'right'}}>
                          {row.cl_bez_dph===0
                            ? <span style={{color:'var(--text-tertiary)',fontSize:13}}>—</span>
                            : <span style={{display:'inline-flex',alignItems:'center',fontSize:12,fontWeight:500,color:diff>0?'var(--red)':diff<0?'var(--green)':'var(--text-tertiary)',background:diff>0?'var(--red-bg)':diff<0?'var(--green-bg)':'transparent',padding:diff!==0?'2px 6px':'0',borderRadius:5}}>
                                {diff===0?'0 Kč':(diff>0?'+':'')+diff.toLocaleString('cs-CZ',{minimumFractionDigits:0,maximumFractionDigits:0})+' Kč'}
                              </span>
                          }
                        </td>
                        {/* Stav */}
                        <td style={{padding:'9px 8px'}}><StavBadge stav={row.stav}/></td>
                        {/* Poznámka */}
                        <td style={{padding:'9px 8px',overflow:'hidden'}}>
                          <EditCell isEditing={editingCell?.id===row.id&&editingCell.field==='poznamka'} value={editValue} display={row.poznamka||<span style={{color:'var(--text-tertiary)'}}>—</span>} onChange={setEditValue} onStart={() => startEdit(row.id,'poznamka',row.poznamka)} onCommit={commitEdit}/>
                        </td>
                        {/* Delete */}
                        <td style={{padding:'9px 4px',textAlign:'center'}}>
                          <button onClick={() => deleteRow(row.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-tertiary)',padding:4,borderRadius:4,opacity:0.4}} onMouseEnter={e=>(e.currentTarget.style.opacity='1')} onMouseLeave={e=>(e.currentTarget.style.opacity='0.4')}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                          </button>
                        </td>
                      </tr>
                    )
                  })}

                  {/* Inline přidání */}
                  {addingRow && (
                    <tr style={{borderTop:'2px solid var(--border-strong)',background:'var(--bg)'}}>
                      <td/>
                      <td style={{padding:'8px 8px'}}>
                        <input autoFocus value={newRow.nazev} onChange={e => setNewRow(p=>({...p,nazev:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter')addRow();if(e.key==='Escape')setAddingRow(false)}} placeholder="Název…" style={{width:'100%',border:'1px solid var(--border-strong)',borderRadius:4,padding:'4px 6px',fontSize:13,outline:'none',background:'var(--surface)'}}/>
                      </td>
                      <td style={{padding:'8px 6px'}}>
                        <select value={newRow.kategorie} onChange={e => setNewRow(p=>({...p,kategorie:e.target.value}))} style={{width:'100%',border:'1px solid var(--border)',borderRadius:4,padding:'4px 4px',fontSize:12,background:'var(--surface)',outline:'none',color:'var(--text-secondary)'}}>
                          {KATEGORIE.map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                      </td>
                      <td style={{padding:'8px 6px'}}>
                        <select value={newRow.pravidelnost} onChange={e => setNewRow(p=>({...p,pravidelnost:e.target.value}))} style={{width:'100%',border:'1px solid var(--border)',borderRadius:4,padding:'4px 4px',fontSize:12,background:'var(--surface)',outline:'none',color:'var(--text-secondary)'}}>
                          {PRAVIDELNOST.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>
                      <td style={{padding:'8px 8px'}}>
                        <input type="number" value={newRow.ucet_bez_dph} onChange={e => setNewRow(p=>({...p,ucet_bez_dph:e.target.value}))} placeholder="0" style={{width:'100%',textAlign:'right',border:'1px solid var(--border)',borderRadius:4,padding:'4px 6px',fontSize:13,outline:'none',background:'var(--surface)'}}/>
                      </td>
                      <td style={{padding:'8px 4px',textAlign:'center'}}>
                        <select value={newRow.dph_sazba} onChange={e => setNewRow(p=>({...p,dph_sazba:parseInt(e.target.value)}))} style={{width:'100%',border:'1px solid var(--border)',borderRadius:4,padding:'4px 2px',fontSize:11,background:'var(--surface)',outline:'none',textAlign:'center'}}>
                          {DPH_SAZBY.map(s => <option key={s} value={s}>{s}%</option>)}
                        </select>
                      </td>
                      <td style={{padding:'8px 8px',textAlign:'right',color:'var(--text-tertiary)',fontSize:13}}>
                        {newRow.ucet_bez_dph ? fmt(calcSDph(parseFloat(newRow.ucet_bez_dph)||0, newRow.dph_sazba)) : '—'}
                      </td>
                      <td style={{padding:'8px 8px'}}>
                        <input type="number" value={newRow.cl_bez_dph} onChange={e => setNewRow(p=>({...p,cl_bez_dph:e.target.value}))} placeholder="0" style={{width:'100%',textAlign:'right',border:'1px solid var(--border)',borderRadius:4,padding:'4px 6px',fontSize:13,outline:'none',background:'var(--surface)'}}/>
                      </td>
                      <td style={{padding:'8px 8px',fontSize:12,color:'var(--text-tertiary)',textAlign:'center'}}>auto</td>
                      <td style={{padding:'8px 8px',fontSize:12,color:'var(--text-tertiary)',textAlign:'center'}}>auto</td>
                      <td style={{padding:'8px 8px'}}>
                        <input type="text" value={newRow.poznamka} onChange={e => setNewRow(p=>({...p,poznamka:e.target.value}))} placeholder="Poznámka…" style={{width:'100%',border:'1px solid var(--border)',borderRadius:4,padding:'4px 6px',fontSize:13,outline:'none',background:'var(--surface)'}}/>
                      </td>
                      <td style={{padding:'8px 4px',textAlign:'center'}}>
                        <button onClick={addRow} style={{background:'var(--accent)',border:'none',color:'white',borderRadius:5,padding:'5px 8px',cursor:'pointer',fontSize:13,fontWeight:500}}>✓</button>
                      </td>
                    </tr>
                  )}

                  {filtered.length===0&&!addingRow&&(
                    <tr><td colSpan={12} style={{padding:'40px',textAlign:'center',color:'var(--text-tertiary)'}}>Žádné položky. Přidej první kliknutím na „Přidat položku".</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function StavBadge({stav}:{stav:string}) {
  const cfg:{[k:string]:{label:string,color:string}} = {
    ok:{label:'✓ Souhlasí',color:'var(--green)'},
    chybi:{label:'✗ V CL chybí',color:'var(--red)'},
    rozdil:{label:'△ Rozdíl',color:'var(--amber)'},
  }
  const c = cfg[stav]||{label:stav,color:'var(--text-tertiary)'}
  return <span style={{fontSize:12,fontWeight:500,color:c.color,whiteSpace:'nowrap'}}>{c.label}</span>
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
