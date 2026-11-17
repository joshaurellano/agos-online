// Short, calm "what to do" lists for each alert level.
// The alert level is how likely a flood is, not how deep it will get, so
// these are light, easy-to-undo steps. Evacuation and other heavy actions
// are announced by the barangay after someone checks the water on the ground.

export const RESIDENT_ACTIONS = {
  en: {
    NORMAL:   ['Keep drains near your home clear of trash.'],
    ADVISORY: ['Keep drains clear.', 'Charge your phone.', 'Check updates.'],
    WARNING:  ['Move valuables and vehicles higher.', 'Avoid low roads.', 'Know your evacuation route.'],
    CRITICAL: ['Pack your go-bag.', 'Avoid floodwater.', 'Follow barangay announcements.'],
  },
  fil: {
    NORMAL:   ['Panatilihing walang basura ang mga kanal malapit sa inyong bahay.'],
    ADVISORY: ['Panatilihing malinis ang mga kanal.', 'I-charge ang inyong telepono.', 'Subaybayan ang mga update.'],
    WARNING:  ['Ilipat sa mas mataas na lugar ang mga gamit at sasakyan.', 'Iwasan ang mababang daan.', 'Alamin ang ruta ng paglikas.'],
    CRITICAL: ['Ihanda ang go-bag.', 'Iwasan ang baha.', 'Sundin ang anunsyo ng barangay.'],
  },
  // Bikol wording: please have a native speaker check it.
  bcl: {
    NORMAL:   ['Pabilin na malinig an mga kanal sa harani kan harong nindo.'],
    ADVISORY: ['Pabilin na malinig an mga kanal.', 'I-charge an cellphone nindo.', 'Bantayan an mga abiso.'],
    WARNING:  ['Ilipat sa mas halangkaw na lugar an mga gamit asin sasakyan.', 'Likayan an mga hababang dalan.', 'Aramon an ruta nin paglikas.'],
    CRITICAL: ['Andamon an go-bag.', 'Likayan an baha.', 'Sunda an anunsyo kan barangay.'],
  },
};

// For barangay staff (shown only when signed in).
export const STAFF_ACTIONS = {
  NORMAL:   ['Routine drain and canal cleaning.', 'Check rescue gear and evacuation centers.'],
  ADVISORY: ['Clean and unclog drainage.', 'Tanods watch the usual flood spots.', 'Alert purok leaders.'],
  WARNING:  ['Tanods check flood spots and report.', 'Notify purok leaders.', 'Get evacuation centers ready.'],
  CRITICAL: ['Same as Warning, plus check on vulnerable households.', 'Check the water depth on the ground before deciding on evacuation.'],
};
