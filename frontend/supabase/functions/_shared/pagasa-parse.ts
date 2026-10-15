// Pure parsing helpers for PAGASA Tropical Cyclone Bulletin (TCB) text.
// No Deno/Node APIs here so it can be unit-tested anywhere.
//
// PAGASA does not publish a stable API, so this is deliberately defensive:
// every field is optional, and the caller records `parse_ok` so the UI never
// claims "no signal" for a bulletin it could not actually read.

export type ParsedBulletin = {
  issuedAt: string | null
  category: string | null
  maxWindsKph: number | null
  gustKph: number | null
  pressureHpa: number | null
  movement: string | null
  center: { lat: number; lon: number } | null
  track: { lat: number; lon: number }[]
  signals: Record<string, string>      // level -> area text
  signalsFound: boolean
  nagaSignal: number | null
  nagaMatch: string | null
  nagaPartial: boolean
  parseOk: boolean
}

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
}

export function cleanText(raw: string): string {
  return raw.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim()
}

// "5:00 PM, 05 August 2026" -> ISO in Manila time (+08:00)
export function parseIssuedAt(text: string): string | null {
  const re = /(\d{1,2}):(\d{2})\s*([AP])\.?M\.?,?\s*(?:of\s*)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/gi
  const idx = text.search(/issued/i)
  const slice = idx >= 0 ? text.slice(idx, idx + 200) : text
  for (const src of [slice, text]) {
    re.lastIndex = 0
    const m = re.exec(src)
    if (!m) continue
    const month = MONTHS[m[5].toLowerCase()]
    if (!month) continue
    let h = parseInt(m[1], 10) % 12
    if (m[3].toUpperCase() === 'P') h += 12
    const iso = `${m[6]}-${month}-${m[4].padStart(2, '0')}T${String(h).padStart(2, '0')}:${m[2]}:00+08:00`
    if (!Number.isNaN(Date.parse(iso))) return iso
  }
  return null
}

const CATEGORY_RE = /\b(Super Typhoon|Typhoon|Severe Tropical Storm|Tropical Storm|Tropical Depression)\b/i

// Every PAGASA page repeats a header/footer ("TROPICAL CYCLONE BULLETIN NR. 7
// ... Page 2 of 4") that can land in the middle of the wind-signal table.
// Remove it before looking for areas.
export function stripPageChrome(text: string): string {
  return text.replace(/TROPICAL CYCLONE BULLETIN NR\.?\s*\d+[\s\S]*?Page\s+\d+\s+of\s+\d+/gi, ' ')
}

// The TCWS table reads, in extracted text:
//   "TCWS No. Luzon Visayas Mindanao 2 Wind threat: Gale-force winds <areas> - -
//    Warning lead time: 24 hours ... 1 Wind threat: Strong winds <areas> ..."
// i.e. "<level> Wind threat: <phrase> <area text>" up to "Warning lead time".
export function extractSignals(rawText: string): Record<string, string> {
  const text = stripPageChrome(rawText).replace(/\s+/g, ' ')
  const re = /(?:^|\s)([1-5])\s+Wind\s+threat:\s*((?:[A-Za-z]+-)?[A-Za-z]+\s+winds?)\s+(.*?)(?=\s+Warning\s+lead\s+time|\s[1-5]\s+Wind\s+threat:|$)/gi
  const out: Record<string, string> = {}
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const areas = m[3].replace(/(?:\s*-\s*)+$/, '').trim()   // drop empty Visayas/Mindanao "- -" cells
    if (areas.length >= 3 && areas.length <= 8000 && !(m[1] in out)) out[m[1]] = areas
  }
  return out
}

// Does this signal's area text cover Naga City (Camarines Sur)?
// PAGASA writes either "the rest of Camarines Sur" / "Camarines Sur" (whole
// remaining province) or "the northern portion of Camarines Sur (Town, Town)".
//   - town list present  -> covered only if Naga is in the list
//   - no list, plain     -> covered
//   - no list, "portion" -> covered but flagged partial (can't tell if Naga is in it)
// "Naga" is only trusted inside the Camarines Sur list, because Naga City,
// Cebu exists too. Never matches Camarines Norte.
export function matchNaga(areaText: string): { match: string; partial: boolean } | null {
  const re = /\bCamarines\s+Sur\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(areaText))) {
    const end = m.index + m[0].length
    const before = areaText.slice(Math.max(0, m.index - 60), m.index)
    const list = /^\s*\(([^)]*)\)/.exec(areaText.slice(end))
    const excerpt = areaText.slice(Math.max(0, m.index - 60), Math.min(areaText.length, end + (list ? list[0].length : 0) + 20)).trim()
    if (list) {
      if (/\bNaga\b/i.test(list[1])) return { match: excerpt, partial: false }
      continue   // a specific town list that does not include Naga
    }
    const qualified = /\b(portion|portions|part|parts)\s+of\s+(?:the\s+)?$/i.test(before) ||
      /\b(northern|southern|eastern|western|central)\s+(?:portion|part)s?\s+of\s+(?:the\s+)?$/i.test(before)
    return { match: excerpt, partial: qualified }
  }
  return null
}

export function extractPositions(text: string): { lat: number; lon: number }[] {
  const re = /(\d{1,2}(?:\.\d+)?)\s*°\s*N[,;]?\s*(\d{2,3}(?:\.\d+)?)\s*°\s*E/g
  const pts: { lat: number; lon: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const lat = parseFloat(m[1]); const lon = parseFloat(m[2])
    if (lat > 0 && lat < 60 && lon > 90 && lon < 180) pts.push({ lat, lon })
  }
  return pts
}

// "12-Hour Forecast 2:00 AM 06 August 2026 17.5 120.3 Over the coastal ..."
export function extractForecastTrack(text: string): { lat: number; lon: number; hours: number }[] {
  const re = /(\d{1,3})-Hour\s+Forecast\s+\d{1,2}:\d{2}\s*[AP]M\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}\s+(\d{1,2}\.\d+)\s+(\d{2,3}\.\d+)/gi
  const pts: { lat: number; lon: number; hours: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) pts.push({ hours: parseInt(m[1], 10), lat: parseFloat(m[2]), lon: parseFloat(m[3]) })
  return pts
}

function firstInt(text: string, re: RegExp): number | null {
  const m = re.exec(text)
  return m ? parseInt(m[1], 10) : null
}

export function parseBulletin(rawText: string): ParsedBulletin {
  const text = cleanText(rawText)
  const signals = extractSignals(text)
  const levels = Object.keys(signals)
  const positions = extractPositions(text)

  let nagaSignal: number | null = null
  let nagaMatch: string | null = null
  let nagaPartial = false
  for (const lvl of levels) {
    const hit = matchNaga(signals[lvl])
    if (hit && (nagaSignal === null || Number(lvl) > nagaSignal)) {
      nagaSignal = Number(lvl); nagaMatch = hit.match; nagaPartial = hit.partial
    }
  }

  const cat = CATEGORY_RE.exec(text)
  const mov = /(?:Present\s+Movement|Movement)\s*:?\s*([A-Za-z\- ]+?\s+at\s+\d+\s*km\/h)/i.exec(text)
  const center = positions[0] ?? null

  // A bulletin counts as readable when we found at least one signal level
  // (or an explicit statement that no signals are raised) AND a position or
  // issue time, so the page is plausibly a real bulletin.
  const noSignals = /\bno\s+(?:tropical\s+cyclone\s+)?(?:wind\s+signals?|TCWS)\b/i.test(text)
  const signalsFound = levels.length > 0
  const parseOk = (signalsFound || noSignals) && (center !== null || parseIssuedAt(text) !== null)

  return {
    issuedAt: parseIssuedAt(text),
    category: cat ? cat[1].replace(/\b\w/g, (c) => c.toUpperCase()) : null,
    maxWindsKph: firstInt(text, /Maximum\s+sustained\s+winds?\s+(?:of\s+)?(\d+)\s*km\/h/i),
    gustKph: firstInt(text, /gustiness\s+(?:of\s+)?(?:up\s+to\s+)?(\d+)\s*km\/h|gusts?\s+(?:of\s+|up\s+to\s+)(\d+)\s*km\/h/i),
    pressureHpa: firstInt(text, /(\d{3,4})\s*hPa/i),
    movement: mov ? mov[1].replace(/\s+/g, ' ').trim() : null,
    center,
    track: extractForecastTrack(text).map(({ lat, lon }) => ({ lat, lon })),
    signals,
    signalsFound,
    nagaSignal,
    nagaMatch,
    nagaPartial,
    parseOk,
  }
}

// "TCB%237_maymay.pdf" -> { no: 7, name: "Maymay" }
export function parseBulletinUrl(url: string): { no: number; name: string } | null {
  const m = /TCB(?:%23|#)(\d+)_([A-Za-z0-9\-]+)\.pdf/i.exec(url)
  if (!m) return null
  const name = m[2].toLowerCase().replace(/(^|-)\w/g, (c) => c.toUpperCase())
  return { no: parseInt(m[1], 10), name }
}

// Find bulletin PDF links in HTML/markdown from PAGASA's bulletin pages.
// Returns only the highest-numbered bulletin per cyclone.
export function findLatestBulletinUrls(html: string): string[] {
  const re = /https?:\/\/pubfiles\.pagasa\.dost\.gov\.ph\/tamss\/weather\/bulletin\/TCB(?:%23|#)\d+_[A-Za-z0-9\-]+\.pdf/gi
  const best = new Map<string, { no: number; url: string }>()
  for (const url of html.match(re) ?? []) {
    const p = parseBulletinUrl(url)
    if (!p) continue
    const cur = best.get(p.name)
    if (!cur || p.no > cur.no) best.set(p.name, { no: p.no, url: url.replace('#', '%23') })
  }
  return [...best.values()].map((b) => b.url)
}
