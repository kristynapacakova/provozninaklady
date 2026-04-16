'use client'
import { useEffect, useState } from 'react'
import { supabase, type Naklad } from '@/lib/supabase'
import Link from 'next/link'

const CURRENT_YEAR = new Date().getFullYear()
const KAT_COLORS: Record<string, string> = {
  'mzdy': '#534AB7', 'provozní náklady': '#185FA5', 'software': '#0F6E56',
  'občerstvení': '#854F0B', 'doprava': '#3B6D11', 'rezerva': '#6b6b67',
  'vzdělávání': '#993556', 'benefity': '#993C1D', '': '#9b9b96'
}
const multMap: Record<string, number> = { 'měsíčně': 1, 'kvartálně': 1/3, 'pololetně': 1/6, 'ročně': 1/12, 'jednorázově': 1/12 }

function fmt(v: number) {
  return v.toLocaleString('cs-CZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' Kč'
}

function monthlyAmount(r: Naklad) {
  return r.ucet_bez_dph * (multMap[r.pravidelnost || 'měsíčně'] ?? 1)
}
function monthlyCl(r: Naklad) {
  return r.cl_bez_dph * (multMap[r.pravidelnost || 'měsíčně'] ?? 1)
}

export default function Dashboard() {
  const [rows, setRows] = useState<Naklad[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase.from('naklady').select('*').eq('rok', CURRENT_YEAR).then(({ data }) => {
      // Deduplicate by name — keep latest month entry per unique name
      const seen = new Map<string, Naklad>()
      ;(data || []).sort((a, b) => b.mesic - a.mesic).forEach(r => {
        if (!seen.has(r.nazev)) seen.set(r.nazev, r)
      })
      setRows(Array.from(seen.values()))
      setLoading(false)
    })
  }, [])

  const filtered = rows.filter(r =>
    !search || r.nazev.toLowerCase().includes(search.toLowerCase()) || (r.kategorie || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalBurnRate = filtered.reduce((s, r) => s + monthlyAmount(r), 0)
  const totalClMonthly = filtered.reduce((s, r) => s + monthlyCl(r), 0)
  const clGap = totalBurnRate - totalClMonthly
  const toClean = filtered.filter(r => r.stav === 'smazat' || r.stav === 'chybi').length
  const totalSDph = filtered.reduce((s, r) => s + r.ucet_s_dph * (multMap[r.pravidelnost || 'měsíčně'] ?? 1), 0)

  // Group by category
  const byKat = filtered.reduce((acc, r) => {
    const k = r.kategorie || 'ostatní'
    if (!acc[k]) acc[k] = { burn: 0, cl: 0, count: 0 }
    acc[k].burn += monthlyAmount(r)
    acc[k].cl += monthlyCl(r)
    acc[k].count++
    return acc
  }, {} as Record<string, { burn: number; cl: number; count: number }>)

  const katEntries = Object.entries(byKat).sort((a, b) => b[1].burn - a[1].burn)
  const maxBurn = Math.max(...katEntries.map(([, v]) => v.burn), 1)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'var(--font)' }}>
      {/* Sidebar */}
      <aside style={{ width: 'var(--sidebar-width)', background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, background: 'var(--accent)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            </div>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Provozní náklady</span>
          </div>
        </div>

        <nav style={{ padding: '12px 8px' }}>
          <div style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--bg)', marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>📊 Dashboard</span>
          </div>
          <Link href="/" style={{ textDecoration: 'none', display: 'block' }}>
            <div style={{ padding: '6px 12px', borderRadius: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>📋 Měsíční přehled</span>
            </div>
          </Link>
        </nav>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 2 }}>Dashboard — {CURRENT_YEAR}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Efektivní měsíční náklady (časové rozlišení) · Zdroj: všechny měsíce roku</p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-tertiary)' }}>Načítám…</div>
          ) : (
            <>
              {/* Hero metric cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
                <div style={{ borderRadius: 10, padding: '20px 22px', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Monthly Burn Rate</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{fmt(totalBurnRate)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>{fmt(totalSDph)} s DPH</div>
                </div>
                <div style={{ borderRadius: 10, padding: '20px 22px', background: '#E6F1FB', border: '1px solid #B5D4F4' }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: '#185FA5', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>CL Plán / měsíc</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#0C447C', lineHeight: 1 }}>{fmt(totalClMonthly)}</div>
                  <div style={{ fontSize: 12, color: '#185FA5', marginTop: 6 }}>bez DPH · Costlocker</div>
                </div>
                <div style={{ borderRadius: 10, padding: '20px 22px', background: clGap === 0 ? '#EAF3DE' : clGap > 0 ? '#FCEBEB' : '#FAEEDA', border: `1px solid ${clGap === 0 ? '#C0DD97' : clGap > 0 ? '#F7C1C1' : '#FAC775'}` }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: clGap === 0 ? '#3B6D11' : clGap > 0 ? '#A32D2D' : '#854F0B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>CL Gap</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: clGap === 0 ? '#27500A' : clGap > 0 ? '#791F1F' : '#633806', lineHeight: 1 }}>
                    {clGap > 0 ? '+' : ''}{fmt(clGap)}
                  </div>
                  <div style={{ fontSize: 12, color: clGap === 0 ? '#3B6D11' : clGap > 0 ? '#A32D2D' : '#854F0B', marginTop: 6 }}>
                    {clGap > 0 ? 'účet > CL plán' : clGap < 0 ? 'CL plán > účet' : 'vše souhlasí'}
                  </div>
                </div>
                <div style={{ borderRadius: 10, padding: '20px 22px', background: toClean > 0 ? '#FCEBEB' : '#EAF3DE', border: `1px solid ${toClean > 0 ? '#F7C1C1' : '#C0DD97'}` }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: toClean > 0 ? '#A32D2D' : '#3B6D11', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Položky k vyčištění</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: toClean > 0 ? '#791F1F' : '#27500A', lineHeight: 1 }}>{toClean}</div>
                  <div style={{ fontSize: 12, color: toClean > 0 ? '#A32D2D' : '#3B6D11', marginTop: 6 }}>chybí v CL / smazat z CL</div>
                </div>
              </div>

              {/* Search */}
              <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
                  <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Hledat položku nebo kategorii…" style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'var(--surface)' }} />
                </div>
                <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{filtered.length} položek</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
                {/* Category breakdown */}
                <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Náklady dle kategorie</span>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>měsíční průměr</span>
                  </div>
                  {katEntries.map(([kat, vals]) => {
                    const pct = (vals.burn / maxBurn) * 100
                    const clPct = (vals.cl / maxBurn) * 100
                    const color = KAT_COLORS[kat] || '#9b9b96'
                    return (
                      <div key={kat} style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color }}>{kat || 'ostatní'}</span>
                          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{fmt(vals.burn)}</span>
                            <span style={{ color: 'var(--text-tertiary)' }}>CL: {fmt(vals.cl)}</span>
                          </div>
                        </div>
                        <div style={{ position: 'relative', height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: color, opacity: 0.3, borderRadius: 3 }} />
                          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(clPct, pct)}%`, background: color, borderRadius: 3 }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Items needing attention */}
                <div style={{ background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Vyžaduje pozornost</span>
                  </div>
                  {filtered.filter(r => r.stav !== 'ok').length === 0 ? (
                    <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>✓ Vše v pořádku</div>
                  ) : (
                    filtered.filter(r => r.stav !== 'ok').map(r => (
                      <div key={r.id} style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{r.nazev}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{r.kategorie || '—'}</div>
                        </div>
                        <StavBadge stav={r.stav} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function StavBadge({ stav }: { stav: string }) {
  const cfg: Record<string, { label: string; color: string }> = {
    ok: { label: '✓ Souhlasí', color: 'var(--green)' },
    chybi: { label: '✗ V CL chybí', color: 'var(--red)' },
    rozdil: { label: '△ Rozdíl', color: 'var(--amber)' },
    smazat: { label: '✕ Smazat z CL', color: '#993556' },
  }
  const c = cfg[stav] || { label: stav, color: 'var(--text-tertiary)' }
  return <span style={{ fontSize: 11, fontWeight: 500, color: c.color, whiteSpace: 'nowrap' }}>{c.label}</span>
}
