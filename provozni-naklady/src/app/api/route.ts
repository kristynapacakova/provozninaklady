import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mediaType } = await req.json()

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20251001',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: `Jsi asistent pro zpracování účetních dat z aplikace Costlocker nebo z výpisu z účtu.

Prohlédni screenshot a extrahuj VŠECHNY jednotlivé řádky s náklady — každý řádek kde je název položky a částka.

IGNORUJ:
- Souhrnné/nadpisové řádky jako "Firemní náklady", "Celkové náklady", "Celkem" apod.
- Řádky bez částky

PRO KAŽDOU POLOŽKU vrať:
- nazev: přesný název jak je na screenshotu
- cl_bez_dph: částka jako číslo (odstraň "Kč", mezery jako oddělovače tisíců, nahraď čárku tečkou). Pokud vidíš jen jednu částku na řádku, použij ji.
- cl_s_dph: stejná hodnota jako cl_bez_dph (pokud DPH není explicitně odděleno)

FORMÁT ČÍSEL v češtině: "310 000,00 Kč" = 310000, "19 100,00 Kč" = 19100, "9 400,00 Kč" = 9400

Odpověz POUZE validním JSON polem, žádný jiný text ani markdown:
[{"nazev":"Pronájem kanceláře","cl_bez_dph":100000,"cl_s_dph":100000},{"nazev":"Asana","cl_bez_dph":19100,"cl_s_dph":19100}]

Pokud nejsou žádné položky, vrať: []`,
              },
            ],
          },
        ],
      }),
    })

    const data = await response.json()
    const text = data.content?.[0]?.text || '[]'

    let items = []
    try {
      const clean = text.replace(/```json|```/g, '').trim()
      items = JSON.parse(clean)
    } catch {
      items = []
    }

    return NextResponse.json({ items })
  } catch (err) {
    console.error('Import error:', err)
    return NextResponse.json({ items: [], error: 'Chyba při zpracování' }, { status: 500 })
  }
}
