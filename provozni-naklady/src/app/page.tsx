'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase, type Naklad } from '@/lib/supabase'

const MONTHS = ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec']
const CURRENT_YEAR = new Date().getFullYear()
const DPH_SAZBY = [0, 10, 12, 21]

function fmt(v: number) {
  return v.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' Kč'
}
function fmtDiff(d: number) {
  if (d === 0) return '—'
  return (d > 0 ? '+' : '') + d.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' Kč'
}
function calcSDph(bezDph: number, sazba: number) {
  return Math.round(bezDph * (1 + sazba / 100))
}

type EditingCell = { id: string; field: keyof Naklad } | null

export default function Home() {
  const [mesic, setMesic] = useState(new Date().getMonth() + 1)
  const [rok] = useState(CURRENT_YEAR)
  const [rows, setRows] = useState<Naklad[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [editingCell, setEditingCell] = useState<EditingCell>(null)
  const [editValue, setEditValue] = useState('')
  const [addingRow, setAddingRow] = useState(false)
  const [newRowName, setNewRowName] = useState('')
  const [filter, setFilter] = useState<'vse' | 'ok' | 'chybi' | 'rozdil'>('vse')
  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState<{nazev: string; cl_bez_dph: number; dph_sazba: number}[] | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importSource, setImportSource] = useState<'cl' | 'ucet'>('cl')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('naklady')
      .select('*')
      .eq('mesic', mesic)
      .eq('rok', rok)
      .order('poradi')
    setRows(data || [])
    setLoading(false)
  }, [mesic, rok])

  useEffect(() => { load() }, [load])

  async function updateField(id: string, field: keyof Naklad, value: string | number) {
    setSaving(id)
    const numericFields = ['ucet_bez_dph', 'cl_bez_dph', 'dph_sazba']
    const val = numericFields.includes(field as string) ? parseFloat(value as string) || 0 : value

    // Recalculate s_dph fields when bez_dph or dph_sazba changes
    const currentRow = rows.find(r => r.id === id)!
    let updates: Partial<Naklad> = { [field]: val }

    if (field === 'ucet_bez_dph' || field === 'dph_sazba') {
      const sazba = field === 'dph_sazba' ? (val as number) : currentRow.dph_sazba
      const bezDph = field === 'ucet_bez_dph' ? (val as number) : currentRow.ucet_bez_dph
      updates.ucet_s_dph = calcSDph(bezDph, sazba)
    }
    if (field === 'cl_bez_dph' || field === 'dph_sazba') {
      const sazba = field === 'dph_sazba' ? (val as number) : currentRow.dph_sazba
      const bezDph = field === 'cl_bez_dph' ? (val as number) : currentRow.cl_bez_dph
      updates.cl_s_dph = calcSDph(bezDph, sazba)
    }

    setRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r))
    await supabase.from('naklady').update(updates).eq('id', id)
    setSaving(null)
  }

  async function addRow() {
    if (!newRowName.trim()) return
    const maxPoradi = rows.length ? Math.max(...rows.map(r => r.poradi)) + 1 : 1
    const { data } = await supabase.from('naklady').insert({
      mesic, rok, nazev: newRowName.trim(),
      ucet_bez_dph: 0, cl_bez_dph: 0,
      ucet_s_dph: 0, cl_s_dph: 0,
      dph_sazba: 21,
      stav: 'ok', poznamka: '', poradi: maxPoradi
    }).select().single()
    if (data) setRows(prev => [...prev, data])
    setNewRowName('')
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

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportLoading(true)
    setImporting(true)
    setImportPreview(null)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      const [meta, imageBase64] = dataUrl.split(',')
      const mediaType = meta.match(/:(.*?);/)?.[1] || 'image/png'
      try {
        const res = await fetch('/api/import-screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64, mediaType }),
        })
        const { items } = await res.json()
        setImportPreview(items)
      } catch {
        setImportPreview([])
      }
      setImportLoading(false)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function confirmImport(selected: typeof importPreview) {
    if (!selected?.length) return
    const maxPoradi = rows.length ? Math.max(...rows.map(r => r.poradi)) : 0
    const toInsert = selected.map((item, i) => {
      const sDph = calcSDph(item.cl_bez_dph, item.dph_sazba)
      return {
        mesic, rok, nazev: item.nazev, dph_sazba: item.dph_sazba,
        ucet_bez_dph: importSource === 'ucet' ? item.cl_bez_dph : 0,
        cl_bez_dph: importSource === 'cl' ? item.cl_bez_dph : 0,
        ucet_s_dph: importSource === 'ucet' ? sDph : 0,
        cl_s_dph: importSource === 'cl' ? sDph : 0,
        stav: 'ok' as const, poznamka: '', poradi: maxPoradi + i + 1,
      }
    })
    const { data } = await supabase.from('naklady').insert(toInsert).select()
    if (data) setRows(prev => [...prev, ...data])
    setImportPreview(null)
    setImporting(false)
  }

  const filtered = filter === 'vse' ? rows : rows.filter(r => r.stav === filter)
  const totalBankEx = rows.reduce((s, r) => s + r.ucet_bez_dph, 0)
  const totalClEx = rows.reduce((s, r) => s + r.cl_bez_dph, 0)
  const totalBankVat = rows.reduce((s, r) => s + r.ucet_s_dph, 0)
  const totalClVat = rows.reduce((s, r) => s + r.cl_s_dph, 0)
  const countOk = rows.filter(r => r.stav === 'ok').length
  const countChybi = rows.filter(r => r.stav === 'chybi').length
  const countRozdil = rows.filter(r => r.stav === 'rozdil').length

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{
        width: 'var(--sidebar-width)', background: 'var(--surface)',
        borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        flexShrink: 0, overflow: 'hidden'
      }}>
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, background: 'var(--accent)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
              </svg>
            </div>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Provozní náklady</span>
          </div>
        </div>

        <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ padding: '0 12px 6px', fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Stav</div>
          {[
            { key: 'vse', label: 'Vše', count: rows.length, dot: null },
            { key: 'ok', label: 'Souhlasí', count: countOk, dot: 'var(--green)' },
            { key: 'chybi', label: 'V CL chybí', count: countChybi, dot: 'var(--red)' },
            { key: 'rozdil', label: 'Rozdíl v částce', count: countRozdil, dot: 'var(--amber)' },
          ].map(({ key, label, count, dot }) => (
            <button key={key} onClick={() => setFilter(key as typeof filter)} style={{
              width: 'calc(100% - 8px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 12px', background: filter === key ? 'var(--bg)' : 'transparent',
              border: 'none', borderRadius: 6, margin: '1px 4px',
              cursor: 'pointer', color: filter === key ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: filter === key ? 500 : 400
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }}/>}
                {!dot && <span style={{ width: 7 }}/>}
                <span style={{ fontSize: 13 }}>{label}</span>
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'var(--bg)', padding: '1px 6px', borderRadius: 4 }}>{count}</span>
            </button>
          ))}
        </div>

        <div style={{ padding: '12px 0', flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '0 12px 6px', fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Měsíc</div>
          {MONTHS.map((m, i) => (
            <button key={i} onClick={() => setMesic(i + 1)} style={{
              width: 'calc(100% - 8px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 12px', background: mesic === i + 1 ? 'var(--bg)' : 'transparent',
              border: 'none', borderRadius: 6, margin: '1px 4px', cursor: 'pointer',
              color: mesic === i + 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: mesic === i + 1 ? 500 : 400, fontSize: 13
            }}>
              {m}
              {mesic === i + 1 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{rok}</span>}
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px 28px 0', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                Provozní náklady — {MONTHS[mesic - 1]} {rok}
              </h1>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Porovnání plateb z účtu s položkami v Costlockeru</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                background: 'var(--surface)', color: 'var(--text-primary)',
                border: '1px solid var(--border-strong)', borderRadius: 8,
                fontWeight: 500, fontSize: 13, cursor: 'pointer'
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                Importovat screenshot
                <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
              </label>
              <button onClick={() => setAddingRow(true)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                background: 'var(--accent)', color: 'var(--accent-text)', border: 'none',
                borderRadius: 8, fontWeight: 500, fontSize: 13
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Přidat položku
              </button>
            </div>
          </div>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, paddingBottom: 20 }}>
            <SummaryCard label="Z účtu celkem" sub="bez DPH" value={fmt(totalBankEx)} />
            <SummaryCard label="Costlocker celkem" sub="bez DPH" value={fmt(totalClEx)} />
            <SummaryCard label="Rozdíl bez DPH" sub="účet vs. CL" value={fmtDiff(totalBankEx - totalClEx)} diff={totalBankEx - totalClEx} />
            <SummaryCard label="Rozdíl s DPH" sub="účet vs. CL" value={fmtDiff(totalBankVat - totalClVat)} diff={totalBankVat - totalClVat} />
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '20px 28px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-tertiary)' }}>Načítám…</div>
          ) : (
            <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', minWidth: 900 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {[
                      { label: 'Název', w: '18%', align: 'left' },
                      { label: 'DPH %', w: '6%', align: 'center' },
                      { label: 'Účet bez DPH', w: '10%', align: 'right' },
                      { label: 'Účet s DPH', w: '10%', align: 'right' },
                      { label: 'CL bez DPH', w: '10%', align: 'right' },
                      { label: 'CL s DPH', w: '10%', align: 'right' },
                      { label: 'Rozdíl bez DPH', w: '9%', align: 'right' },
                      { label: 'Rozdíl s DPH', w: '9%', align: 'right' },
                      { label: 'Stav', w: '9%', align: 'left' },
                      { label: 'Poznámka', w: '9%', align: 'left' },
                    ].map((col, i) => (
                      <th key={i} style={{
                        padding: '10px 10px', textAlign: col.align as 'left' | 'right' | 'center',
                        fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)',
                        letterSpacing: '0.05em', textTransform: 'uppercase', width: col.w,
                        background: '#fafaf8', whiteSpace: 'nowrap'
                      }}>{col.label}</th>
                    ))}
                    <th style={{ width: 36, background: '#fafaf8' }} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, idx) => {
                    const diffEx = row.ucet_bez_dph - row.cl_bez_dph
                    const diffVat = row.ucet_s_dph - row.cl_s_dph
                    return (
                      <tr key={row.id} style={{
                        borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                        background: saving === row.id ? '#fafaf8' : undefined
                      }}>
                        <td style={{ padding: '9px 10px' }}>
                          <EditCell
                            isEditing={editingCell?.id === row.id && editingCell.field === 'nazev'}
                            value={editValue} display={row.nazev || '—'}
                            onChange={setEditValue}
                            onStart={() => startEdit(row.id, 'nazev', row.nazev)}
                            onCommit={commitEdit} isText
                          />
                        </td>
                        {/* DPH sazba dropdown */}
                        <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                          <select
                            value={row.dph_sazba ?? 21}
                            onChange={e => updateField(row.id, 'dph_sazba', e.target.value)}
                            style={{
                              border: '1px solid var(--border)', background: 'var(--bg)',
                              borderRadius: 5, fontSize: 12, fontFamily: 'var(--font)',
                              cursor: 'pointer', outline: 'none', padding: '2px 4px',
                              color: 'var(--text-primary)', fontWeight: 500, width: '100%', textAlign: 'center'
                            }}
                          >
                            {DPH_SAZBY.map(s => (
                              <option key={s} value={s}>{s} %</option>
                            ))}
                          </select>
                        </td>
                        <NumCell row={row} field="ucet_bez_dph" editingCell={editingCell} editValue={editValue} setEditValue={setEditValue} startEdit={startEdit} commitEdit={commitEdit} />
                        {/* ucet_s_dph — computed, read only */}
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                          <span style={{ fontSize: 13, color: row.ucet_s_dph === 0 ? 'var(--text-tertiary)' : 'var(--text-secondary)' }}>
                            {row.ucet_s_dph === 0 ? '—' : fmt(row.ucet_s_dph)}
                          </span>
                        </td>
                        <NumCell row={row} field="cl_bez_dph" editingCell={editingCell} editValue={editValue} setEditValue={setEditValue} startEdit={startEdit} commitEdit={commitEdit} />
                        {/* cl_s_dph — computed, read only */}
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                          <span style={{ fontSize: 13, color: row.cl_s_dph === 0 ? 'var(--text-tertiary)' : 'var(--text-secondary)' }}>
                            {row.cl_s_dph === 0 ? '—' : fmt(row.cl_s_dph)}
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}><DiffBadge value={diffEx} /></td>
                        <td style={{ padding: '9px 10px', textAlign: 'right' }}><DiffBadge value={diffVat} /></td>
                        <td style={{ padding: '9px 10px' }}>
                          <select
                            value={row.stav}
                            onChange={e => updateField(row.id, 'stav', e.target.value)}
                            style={{
                              border: 'none', background: 'transparent', fontSize: 12,
                              fontFamily: 'var(--font)', cursor: 'pointer', outline: 'none',
                              color: row.stav === 'ok' ? 'var(--green)' : row.stav === 'chybi' ? 'var(--red)' : 'var(--amber)',
                              fontWeight: 500
                            }}
                          >
                            <option value="ok">✓ Souhlasí</option>
                            <option value="chybi">✗ V CL chybí</option>
                            <option value="rozdil">△ Rozdíl</option>
                          </select>
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <EditCell
                            isEditing={editingCell?.id === row.id && editingCell.field === 'poznamka'}
                            value={editValue}
                            display={row.poznamka || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                            onChange={setEditValue}
                            onStart={() => startEdit(row.id, 'poznamka', row.poznamka)}
                            onCommit={commitEdit} isText
                          />
                        </td>
                        <td style={{ padding: '9px 6px', textAlign: 'center' }}>
                          <button onClick={() => deleteRow(row.id)} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-tertiary)', padding: 4, borderRadius: 4, opacity: 0.6
                          }}
                            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                            onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                              <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                            </svg>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && !addingRow && (
                    <tr>
                      <td colSpan={11} style={{ padding: '40px 12px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        Žádné položky. Přidej první kliknutím na „Přidat položku".
                      </td>
                    </tr>
                  )}
                  {addingRow && (
                    <tr style={{ borderTop: '1px solid var(--border)' }}>
                      <td colSpan={11} style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            autoFocus value={newRowName}
                            onChange={e => setNewRowName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') addRow(); if (e.key === 'Escape') setAddingRow(false) }}
                            placeholder="Název položky…"
                            style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border-strong)', borderRadius: 6, fontSize: 13, outline: 'none', background: 'var(--bg)' }}
                          />
                          <button onClick={addRow} style={{ padding: '6px 14px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500 }}>Přidat</button>
                          <button onClick={() => setAddingRow(false)} style={{ padding: '6px 10px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>Zrušit</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Import Modal */}
      {importing && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
        }} onClick={e => { if (e.target === e.currentTarget) { setImporting(false); setImportPreview(null) } }}>
          <div style={{
            background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)',
            width: 620, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden'
          }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 600 }}>Import ze screenshotu</h2>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>Zkontroluj položky a uprav DPH sazbu dle potřeby</p>
                </div>
                <button onClick={() => { setImporting(false); setImportPreview(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 20, lineHeight: 1, padding: 4 }}>×</button>
              </div>
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Importovat jako:</span>
                {(['cl', 'ucet'] as const).map(src => (
                  <button key={src} onClick={() => setImportSource(src)} style={{
                    padding: '4px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    background: importSource === src ? 'var(--accent)' : 'transparent',
                    color: importSource === src ? 'white' : 'var(--text-secondary)',
                    border: `1px solid ${importSource === src ? 'var(--accent)' : 'var(--border)'}`,
                  }}>
                    {src === 'cl' ? 'Costlocker (CL)' : 'Z účtu'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
              {importLoading ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  Claude čte screenshot…
                </div>
              ) : importPreview?.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  Nepodařilo se najít žádné položky. Zkus jiný screenshot.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Název', 'Bez DPH', 'DPH %', 'S DPH'].map(h => (
                        <th key={h} style={{ textAlign: h === 'Název' ? 'left' : 'right', padding: '6px 8px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview?.map((item, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '9px 8px' }}>{item.nazev}</td>
                        <td style={{ padding: '9px 8px', textAlign: 'right' }}>{fmt(item.cl_bez_dph)}</td>
                        <td style={{ padding: '9px 8px', textAlign: 'right' }}>
                          <select
                            value={item.dph_sazba}
                            onChange={e => {
                              const updated = [...(importPreview || [])]
                              updated[i] = { ...updated[i], dph_sazba: parseInt(e.target.value) }
                              setImportPreview(updated)
                            }}
                            style={{ border: '1px solid var(--border)', borderRadius: 4, fontSize: 12, padding: '2px 4px', background: 'var(--bg)', cursor: 'pointer' }}
                          >
                            {DPH_SAZBY.map(s => <option key={s} value={s}>{s} %</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '9px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                          {fmt(calcSDph(item.cl_bez_dph, item.dph_sazba))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {!importLoading && importPreview && importPreview.length > 0 && (
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setImporting(false); setImportPreview(null) }} style={{ padding: '8px 16px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>Zrušit</button>
                <button onClick={() => confirmImport(importPreview)} style={{ padding: '8px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>
                  Importovat {importPreview.length} {importPreview.length === 1 ? 'položku' : importPreview.length < 5 ? 'položky' : 'položek'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, sub, value, diff }: { label: string; sub: string; value: string; diff?: number }) {
  const isNeutral = diff === undefined || diff === 0
  const color = isNeutral ? 'var(--text-primary)' : diff! > 0 ? 'var(--red)' : 'var(--green)'
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color, marginBottom: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{sub}</div>
    </div>
  )
}

function DiffBadge({ value }: { value: number }) {
  if (value === 0) return <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>—</span>
  const pos = value > 0
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 12, fontWeight: 500,
      color: pos ? 'var(--red)' : 'var(--green)',
      background: pos ? 'var(--red-bg)' : 'var(--green-bg)',
      padding: '2px 7px', borderRadius: 5
    }}>
      {pos ? '+' : ''}{value.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} Kč
    </span>
  )
}

function NumCell({ row, field, editingCell, editValue, setEditValue, startEdit, commitEdit }: {
  row: Naklad; field: keyof Naklad; editingCell: EditingCell; editValue: string;
  setEditValue: (v: string) => void; startEdit: (id: string, field: keyof Naklad, v: string | number) => void; commitEdit: () => void
}) {
  const isEditing = editingCell?.id === row.id && editingCell.field === field
  const val = row[field] as number
  return (
    <td style={{ padding: '9px 10px', textAlign: 'right' }}>
      {isEditing ? (
        <input autoFocus type="number" value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit() }}
          style={{ width: '100%', textAlign: 'right', border: '1px solid var(--border-strong)', borderRadius: 4, padding: '3px 6px', fontSize: 13, background: 'var(--bg)', outline: 'none' }}
        />
      ) : (
        <span onClick={() => startEdit(row.id, field, val)}
          style={{ cursor: 'text', fontSize: 13, color: val === 0 ? 'var(--text-tertiary)' : 'var(--text-primary)' }}
          title="Klikni pro úpravu"
        >
          {val === 0 ? '—' : fmt(val)}
        </span>
      )}
    </td>
  )
}

function EditCell({ isEditing, value, display, onChange, onStart, onCommit, isText }: {
  isEditing: boolean; value: string; display: React.ReactNode; onChange: (v: string) => void;
  onStart: () => void; onCommit: () => void; isText?: boolean
}) {
  return isEditing ? (
    <input autoFocus type="text" value={value}
      onChange={e => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={e => { if (e.key === 'Enter') onCommit() }}
      style={{ width: '100%', border: '1px solid var(--border-strong)', borderRadius: 4, padding: '3px 6px', fontSize: 13, background: 'var(--bg)', outline: 'none' }}
    />
  ) : (
    <span onClick={onStart} style={{ cursor: 'text', fontSize: 13 }} title="Klikni pro úpravu">{display}</span>
  )
}
