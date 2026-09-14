// ─── Critical Facilities ────────────────────────────────────────────────────
// A Project-NOAH-style "exposure" layer: facilities that matter most during
// a flood event (hospitals/clinics, schools, and the responders people call
// on), shown against the hazard shading so viewers can see which ones sit
// inside a flood-prone zone. This is deliberately separate from the
// evacuation-centers list on the Evacuation Map page (FloodMapPage.jsx) — a
// school can be BOTH a place children study every day AND a designated
// evacuation site, but the two lists answer different questions ("is this
// facility at risk?" vs "where do I go?") and are allowed to overlap.
//
// Coordinates as supplied directly by the user (Sep 2026) — treated as
// verified/ground-truthed.
export const CRITICAL_FACILITIES = [
  {
    id: 'nicc-doctors-hospital',
    name: 'Nicc Doctors Hospital',
    facilityType: 'hospital',
    position: { lat: 13.616257862678793, lng: 123.19336183372815 },
  },
  {
    id: 'bicol-access-health-centrum',
    name: 'Bicol Access Health Centrum',
    facilityType: 'clinic',
    position: { lat: 13.618898957592357, lng: 123.1923624054582 },
  },
  {
    id: 'triangulo-elementary-school',
    name: 'Triangulo Elementary School',
    facilityType: 'school',
    position: { lat: 13.616665295547357, lng: 123.19085913810308 },
  },
  {
    id: 'ina-birthing-family-planning-clinic',
    name: 'Ina Birthing And Family Planning Clinic',
    facilityType: 'clinic',
    position: { lat: 13.621772533476271, lng: 123.19322369980672 },
  },
  {
    id: 'jose-rizal-elementary-school',
    name: 'Jose Rizal Elementary School',
    facilityType: 'school',
    position: { lat: 13.619575066533239, lng: 123.1966276896565 },
  },
  {
    id: 'chin-po-tong-volunteer-fire-brigade',
    name: 'Chin Po Tong Volunteer Fire Brigade',
    facilityType: 'fire_station',
    position: { lat: 13.619955801678392, lng: 123.19272649755152 },
  },
  {
    id: 'naga-city-police-station-5',
    name: 'Naga City Police Station 5',
    facilityType: 'police',
    position: { lat: 13.619081276593883, lng: 123.19033990258485 },
  },
  {
    id: 'st-john-hospital-inc',
    name: 'St. John Hospital, Inc.',
    facilityType: 'hospital',
    position: { lat: 13.622928272564026, lng: 123.19093833993082 },
  },
  {
    id: 'bicol-medical-center',
    name: 'Bicol Medical Center',
    facilityType: 'hospital',
    position: { lat: 13.623320661205083, lng: 123.19962881054649 },
  },
  {
    id: 'lerma-barangay-health-station',
    name: 'Lerma Barangay Health Station',
    facilityType: 'clinic',
    position: { lat: 13.622610848581944, lng: 123.18804515657366 },
  },
  {
    id: 'naga-city-police-station-2',
    name: 'Naga City Police Station 2',
    facilityType: 'police',
    position: { lat: 13.611673381247206, lng: 123.21295568965647 },
  },
];

// Shared styling so every surface that renders this layer (2D Leaflet map,
// 3D MapLibre map, the dashboard's "Critical Facilities" list panel) looks
// consistent. Colors intentionally avoid the alert-severity palette
// (green/yellow/orange/red) and the hazard-legend palette (blue/amber/red)
// so a facility pin/card is never mistaken for a severity signal.
export const FACILITY_STYLE = {
  hospital:     { color: '#ec4899', label: 'Hospital' },
  clinic:       { color: '#14b8a6', label: 'Clinic / Health Station' },
  school:       { color: '#8b5cf6', label: 'School' },
  police:       { color: '#6366f1', label: 'Police' },
  fire_station: { color: '#fb923c', label: 'Fire Station' },
};

// Display order for filter chips / grouped lists — hospitals and clinics
// first since they're the highest-stakes lookup during a flood, then
// schools, then the responder categories.
export const FACILITY_TYPE_ORDER = ['hospital', 'clinic', 'school', 'police', 'fire_station'];

// Plain single-path glyphs (no circle/box container) -- one flat icon per
// category, same silhouette everywhere it's used. Path data only, so this
// file stays framework-agnostic: React contexts render it via <path d=.../>
// directly, non-React contexts (Leaflet divIcon, MapLibre marker elements)
// use facilityIconSvgMarkup() below to get a plain SVG string instead.
export const FACILITY_ICON_PATHS = {
  hospital: {
    viewBox: '0 0 448 512',
    d: 'M448 492v20H0v-20c0-6.627 5.373-12 12-12h20V120c0-13.255 10.745-24 24-24h88V24c0-13.255 10.745-24 24-24h112c13.255 0 24 10.745 24 24v72h88c13.255 0 24 10.745 24 24v360h20c6.627 0 12 5.373 12 12zM308 192h-40c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h40c6.627 0 12-5.373 12-12v-40c0-6.627-5.373-12-12-12zm-168 64h40c6.627 0 12-5.373 12-12v-40c0-6.627-5.373-12-12-12h-40c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12zm104 128h-40c-6.627 0-12 5.373-12 12v84h64v-84c0-6.627-5.373-12-12-12zm64-96h-40c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h40c6.627 0 12-5.373 12-12v-40c0-6.627-5.373-12-12-12zm-116 12c0-6.627-5.373-12-12-12h-40c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h40c6.627 0 12-5.373 12-12v-40zM182 96h26v26a6 6 0 0 0 6 6h20a6 6 0 0 0 6-6V96h26a6 6 0 0 0 6-6V70a6 6 0 0 0-6-6h-26V38a6 6 0 0 0-6-6h-20a6 6 0 0 0-6 6v26h-26a6 6 0 0 0-6 6v20a6 6 0 0 0 6 6z',
  },
  clinic: {
    viewBox: '0 0 512 512',
    d: 'M464 128h-80V80c0-26.5-21.5-48-48-48H176c-26.5 0-48 21.5-48 48v48H48c-26.5 0-48 21.5-48 48v288c0 26.5 21.5 48 48 48h416c26.5 0 48-21.5 48-48V176c0-26.5-21.5-48-48-48zM192 96h128v32H192V96zm160 248c0 4.4-3.6 8-8 8h-56v56c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8v-56h-56c-4.4 0-8-3.6-8-8v-48c0-4.4 3.6-8 8-8h56v-56c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v56h56c4.4 0 8 3.6 8 8v48z',
  },
  school: {
    viewBox: '0 0 640 512',
    d: 'M622.34 153.2L343.4 67.5c-15.2-4.67-31.6-4.67-46.79 0L17.66 153.2c-23.54 7.23-23.54 38.36 0 45.59l48.63 14.94c-10.67 13.19-17.23 29.28-17.88 46.9C38.78 266.15 32 276.11 32 288c0 10.78 5.68 19.85 13.86 25.65L20.33 428.53C18.11 438.52 25.71 448 35.94 448h56.11c10.24 0 17.84-9.48 15.62-19.47L82.14 313.65C90.32 307.85 96 298.78 96 288c0-11.57-6.47-21.25-15.66-26.87.76-15.02 8.44-28.3 20.69-36.72L296.6 284.5c9.06 2.78 26.44 6.25 46.79 0l278.95-85.7c23.55-7.24 23.55-38.36 0-45.6zM352.79 315.09c-28.53 8.76-52.84 3.92-65.59 0l-145.02-44.55L128 384c0 35.35 85.96 64 192 64s192-28.65 192-64l-14.18-113.47-145.03 44.56z',
  },
  police: {
    viewBox: '0 0 512 512',
    d: 'M466.5 83.7l-192-80a48.15 48.15 0 0 0-36.9 0l-192 80C27.7 91.1 16 108.6 16 128c0 198.5 114.5 335.7 221.5 380.3 11.8 4.9 25.1 4.9 36.9 0C360.1 472.6 496 349.3 496 128c0-19.4-11.7-36.9-29.5-44.3zM256.1 446.3l-.1-381 175.9 73.3c-3.3 151.4-82.1 261.1-175.8 307.7z',
  },
  fire_station: {
    viewBox: '0 0 448 512',
    d: 'M323.56 51.2c-20.8 19.3-39.58 39.59-56.22 59.97C240.08 73.62 206.28 35.53 168 0 69.74 91.17 0 209.96 0 281.6 0 408.85 100.29 512 224 512s224-103.15 224-230.4c0-53.27-51.98-163.14-124.44-230.4zm-19.47 340.65C282.43 407.01 255.72 416 226.86 416 154.71 416 96 368.26 96 290.75c0-38.61 24.31-72.63 72.79-130.75 6.93 7.98 98.83 125.34 98.83 125.34l58.63-66.88c4.14 6.85 7.91 13.55 11.27 19.97 27.35 52.19 15.81 118.97-33.43 153.42z',
  },
};

// Builds a bare <svg> string (path only, no wrapper box/circle) for
// non-React DOM contexts -- Leaflet L.divIcon html and MapLibre marker
// elements. A subtle white outline (stroke) stands in for the old circle
// background, keeping the icon legible over a busy hazard-colored map
// without boxing it in.
export function facilityIconSvgMarkup(facilityType, { size = 20, color } = {}) {
  const glyph = FACILITY_ICON_PATHS[facilityType];
  const fill = color || (FACILITY_STYLE[facilityType] && FACILITY_STYLE[facilityType].color) || '#333';
  if (!glyph) return '';
  return `<svg viewBox="${glyph.viewBox}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.55));"><path d="${glyph.d}" fill="${fill}" stroke="#fff" stroke-width="10" paint-order="stroke"/></svg>`;
}
