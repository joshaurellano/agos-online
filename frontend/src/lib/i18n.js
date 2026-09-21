// Translation dictionary for AGOS. Scoped deliberately: this covers the
// strings that matter most in an actual emergency -- alert names/meanings,
// evacuation guidance, and primary navigation -- rather than attempting a
// full app-wide translation in one pass. Naga City's day-to-day language is
// Bikol Naga, with Filipino as the shared lingua franca; English-only alerts
// risk being misread by exactly the residents (elderly, less English-fluent)
// who are most at risk during a fast-moving flood. Extend LANGUAGES /
// STRINGS as more of the app is translated.

export const LANGUAGES = [
  { code: 'en',  label: 'English' },
  { code: 'fil', label: 'Filipino' },
  { code: 'bcl', label: 'Bikol' },
];

export const STRINGS = {
  en: {
    dashboardTitle: 'Flood Early Warning Dashboard',
    alertLevel: {
      NORMAL:   { name: 'Normal',   desc: 'No flood risk detected. Routine monitoring continues.' },
      ADVISORY: { name: 'Advisory', desc: 'Conditions are being watched closely. No action needed yet.' },
      WARNING:  { name: 'Warning',  desc: 'Flooding is possible within hours. Prepare to move to higher ground.' },
      CRITICAL: { name: 'Critical', desc: 'Flooding is happening or imminent. Evacuate low-lying areas now.' },
    },
    alertChanged: 'Alert level changed to',
    skipToContent: 'Skip to main content',
    evacuateNow: 'Evacuate now',
    findEvacuationRoute: 'Find the nearest evacuation route',
    reportWhatYouSee: 'Report what you see',
    stillHappening: 'Still happening?',
    confirmed: 'Confirmed',
    nav: {
      dashboard: 'Dashboard',
      rainfall: 'Rainfall',
      evacuationMap: 'Evacuation Map',
      analytics: 'ML Analytics',
      status: 'Status',
    },
    disclaimer: 'For official advisories, check with the Barangay or CDRRMO. In an emergency, follow their instructions.',
  },
  fil: {
    dashboardTitle: 'Dashboard ng Babalang Pambaha',
    alertLevel: {
      NORMAL:   { name: 'Normal',   desc: 'Walang nakitang panganib ng baha. Patuloy ang regular na pagmamanman.' },
      ADVISORY: { name: 'Advisory', desc: 'Sinusubaybayan nang mabuti ang kalagayan. Wala pang kailangang gawin.' },
      WARNING:  { name: 'Warning',  desc: 'Posibleng magbaha sa loob ng ilang oras. Maghanda nang lumipat sa mataas na lugar.' },
      CRITICAL: { name: 'Kritikal', desc: 'Nagbabaha na o malapit nang magbaha. Lumikas agad sa mga mababang lugar.' },
    },
    alertChanged: 'Nagbago ang antas ng alerto sa',
    skipToContent: 'Lumaktaw sa pangunahing nilalaman',
    evacuateNow: 'Lumikas na ngayon',
    findEvacuationRoute: 'Hanapin ang pinakamalapit na ruta ng paglikas',
    reportWhatYouSee: 'I-ulat ang iyong nakikita',
    stillHappening: 'Nagpapatuloy pa ba?',
    confirmed: 'Nakumpirma',
    nav: {
      dashboard: 'Dashboard',
      rainfall: 'Ulan',
      evacuationMap: 'Mapa ng Paglikas',
      analytics: 'ML Analytics',
      status: 'Kalagayan',
    },
    disclaimer: 'Para sa opisyal na abiso, makipag-ugnayan sa Barangay o CDRRMO. Sa oras ng emergency, sundin ang kanilang mga tagubilin.',
  },
  bcl: {
    dashboardTitle: 'Dashboard kan Ampat na Babala sa Baha',
    alertLevel: {
      NORMAL:   { name: 'Normal',   desc: 'Mayong nahiling na peligro sa baha. Padagos an regular na pagbantay.' },
      ADVISORY: { name: 'Advisory', desc: 'Binabantayan an kamugtakan. Mayo pang kaipuhan na gibuhon.' },
      WARNING:  { name: 'Warning',  desc: 'Posibleng magbaha sa laog nin pirang oras. Mag-andam na maglipat sa halangkaw na lugar.' },
      CRITICAL: { name: 'Kritikal', desc: 'Nagbabaha na o hampang-hampang na magbaha. Lumikas tulos sa hababang lugar.' },
    },
    evacuateNow: 'Lumikas na ngonyan',
    findEvacuationRoute: 'Hanapon an pinakaharani na ruta nin paglikas',
    reportWhatYouSee: 'I-report an saimong naheheling',
    stillHappening: 'Padagos pa daw?',
    confirmed: 'Kumpirmado',
    nav: {
      dashboard: 'Dashboard',
      rainfall: 'Uran',
      evacuationMap: 'Mapa nin Paglikas',
      analytics: 'ML Analytics',
      status: 'Kamugtakan',
    },
    disclaimer: 'Para sa opisyal na anunsyo, magkonsulta sa Barangay o CDRRMO. Durante nin emergency, sunuron an mga instruksyon ninda.',
  },
};

export function t(lang, path) {
  const dict = STRINGS[lang] ?? STRINGS.en;
  const parts = path.split('.');
  let node = dict;
  for (const p of parts) {
    node = node?.[p];
    if (node === undefined) break;
  }
  if (node !== undefined) return node;
  // Fall back to English if a key hasn't been translated yet for this language.
  let fallback = STRINGS.en;
  for (const p of parts) fallback = fallback?.[p];
  return fallback ?? path;
}