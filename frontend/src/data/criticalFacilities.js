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
// verified/ground-truthed, unlike the earlier placeholder hospital pin this
// file used to ship with.
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
  hospital:     { color: '#ec4899', label: 'Hospital',           emoji: '\u{1F3E5}' }, // 🏥
  clinic:       { color: '#14b8a6', label: 'Clinic / Health Station', emoji: '\u{2695}\u{FE0F}' }, // ⚕️
  school:       { color: '#8b5cf6', label: 'School',             emoji: '\u{1F3EB}' }, // 🏫
  police:       { color: '#6366f1', label: 'Police',             emoji: '\u{1F46E}' }, // 👮
  fire_station: { color: '#fb923c', label: 'Fire Station',       emoji: '\u{1F692}' }, // 🚒
};

// Display order for filter chips / grouped lists — hospitals and clinics
// first since they're the highest-stakes lookup during a flood, then
// schools, then the responder categories.
export const FACILITY_TYPE_ORDER = ['hospital', 'clinic', 'school', 'police', 'fire_station'];
