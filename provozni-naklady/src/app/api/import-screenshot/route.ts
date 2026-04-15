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
        model: 'claude-haiku-4-5-20251001',
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
                text: `Prohlédni screenshot a extrahuj VŠECHNY řádky kde je název a částka v Kč.

IGNORUJ nadpisové řádky jako "Firemní náklady", "Celkem" apod.

Vrať POUZE JSON pole, žádný jiný text:
[{"nazev":"1password","cl_bez_dph":3200,"dph_sazba":21},{"nazev":"Káva","cl_bez_dph":3000,"dph_sazba":12}]

Pravidla pro čísla: "3 200,00 Kč" = 3200, "19 100,00 Kč" = 19100
Pravidla pro DPH: software/služby = 21, jídlo/káva/voda = 12, bez DPH = 0

Pokud nejsou položky, vrať: []`,
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic API error:', err)
      return NextResponse.json({ items: [], error: err }, { status: 500 })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || '[]'
    console.log('Claude response:', text)

    let items = []
    try {
      const clean = text.replace(/```json|```/g, '').trim()
      items = JSON.parse(clean)
    } catch (e) {
      console.error('JSON parse error:', e, 'Raw:', text)
      items = []
    }

    return NextResponse.json({ items })
  } catch (err) {
    console.error('Import error:', err)
    return NextResponse.json({ items: [], error: String(err) }, { status: 500 })
  }
}
