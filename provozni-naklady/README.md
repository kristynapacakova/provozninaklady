# Provozní náklady

Aplikace pro porovnání plateb z bankovního účtu s položkami v Costlockeru.

## Rychlý start

### 1. Supabase — nastav databázi

1. Přejdi na [supabase.com](https://supabase.com) a vytvoř nový projekt
2. Otevři **SQL Editor** a spusť celý obsah souboru `supabase-schema.sql`
3. Zkopíruj si z **Settings → API**:
   - `Project URL`
   - `anon public` klíč

### 2. Lokální vývoj

```bash
cp .env.local.example .env.local
```

Otevři `.env.local` a doplň hodnoty ze Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

```bash
npm install
npm run dev
```

Otevři [http://localhost:3000](http://localhost:3000)

### 3. Deploy na Vercel

1. Pushni projekt na GitHub
2. Na [vercel.com](https://vercel.com) klikni **Add New Project** a vyber repozitář
3. V nastavení projektu přidej **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Klikni **Deploy** — hotovo!

## Jak používat

- **Přepínání měsíců** — v levém panelu klikni na měsíc
- **Úprava hodnot** — klikni na libovolnou buňku v tabulce
- **Stav položky** — nastav ručně: Souhlasí / V CL chybí / Rozdíl
- **Filtrování** — v levém panelu filtruj dle stavu
- **Přidání položky** — tlačítko „Přidat položku" vpravo nahoře
- **Smazání** — ikona koše na konci každého řádku

## Struktura projektu

```
src/
  app/
    page.tsx       # Hlavní stránka (celá aplikace)
    layout.tsx     # Root layout
    globals.css    # Globální styly
  lib/
    supabase.ts    # Supabase klient + typy
supabase-schema.sql  # SQL pro vytvoření tabulky
```
