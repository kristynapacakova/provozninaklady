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
        model: 'claude-opus-4-5',
        max_tokens: 1024,
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
                text: `Jsi asistent pro zpracování účetních dat. Prohlédni tento screenshot a extrahuj z něj všechny položky provozních nákladů.

Pro každou položku vrať:
- nazev: název položky/služby
- cl_bez_dph: částka bez DPH v Kč (číslo, bez mezer a symbolů)
- cl_s_dph: částka s DPH v Kč (číslo, pokud není uvedena, vypočítej jako cl_bez_dph * 1.21)

Odpověz POUZE validním JSON polem, bez žádného jiného textu, vysvětlení ani markdown formátování. Příklad formátu:
[{"nazev":"Nájem","cl_bez_dph":25000,"cl_s_dph":30250},{"nazev":"Internet","cl_bez_dph":890,"cl_s_dph":1077.9}]

Pokud na screenshotu nejsou žádné náklady nebo ho nedokážeš přečíst, vrať prázdné pole: []`,
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
