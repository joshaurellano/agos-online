// Emergency directory data. Edit this file to update numbers; the page reads it.
//
// Sources: the MyNaga app (Emergency tab) and the City of Naga's Emergency
// Hotlines page, www2.naga.gov.ph/emergency-hotline (updated Aug 22, 2025).
// Numbers below were typed in from screenshots, so re-check each one against
// the source (or by calling) before a public launch. Keep COLLECTED current.

export const COLLECTED = 'November 18, 2026';

export const SOURCES = [
  { label: 'MyNaga app, Emergency tab' },
  { label: 'City Government of Naga, Emergency Hotlines', href: 'https://www2.naga.gov.ph/emergency-hotline/' },
];

export const OFFICIAL_LIST = { label: 'Full list of Naga City emergency numbers', href: 'https://www2.naga.gov.ph/emergency-hotline/' };

export const GROUPS = [
  { key: 'comcen',   label: 'City command center' },
  { key: 'fire',     label: 'Fire protection' },
  { key: 'hospital', label: 'Hospitals' },
  { key: 'redcross', label: 'Red Cross' },
  { key: 'barangay', label: 'Our barangay' },
];

// `own: true` marks Barangay Triangulo's own captain so it is shown first.
export const CONTACTS = [
  {
    group: 'comcen', name: 'Central Communications Center (COMCEN)',
    note: 'Dispatches city emergency teams, 24 hours. UHF radio: 406.3000.',
    numbers: ['0908 525 3000', '0963 220 9700', '(054) 472 3000', '(054) 871 2050 local 3000'],
  },
  {
    group: 'fire', name: 'BFP, Bureau of Fire Protection',
    address: 'J. Miranda Ave., Zone 5, Brgy. Concepcion Pequeña',
    numbers: ['+63 923 083 9429', '(054) 473 8472', '(054) 473 2633', '(054) 871 6454'],
  },
  {
    group: 'fire', name: 'Naga White, Filipino-Chinese Volunteer Firefighters Inc.',
    address: '4400 Magsaysay Ave.',
    numbers: ['+63 917 308 1800'],
  },
  {
    group: 'hospital', name: 'Bicol Access Health Centrum',
    address: 'Central Business District II, Zone 4, Brgy. Triangulo',
    numbers: ['+63 927 122 6506', '+63 968 855 4602', '+63 968 852 5794'],
  },
  {
    group: 'hospital', name: 'NICC Hospital',
    address: 'Roxas Avenue (Diversion Road), Zone 3, Brgy. Triangulo',
    numbers: ['+63 998 976 2712', '+63 917 134 3797'],
  },
  {
    group: 'hospital', name: 'USI Mother Seton Hospital',
    address: 'Roxas Avenue (Diversion Road), Zone 3, Brgy. Triangulo',
    numbers: ['+63 947 934 7370', '+63 917 809 2843'],
  },
  {
    group: 'hospital', name: 'Dr. Nilo O. Roa Memorial Foundation Hospital',
    address: 'Dimasalang St., Zone 3, Brgy. San Francisco',
    numbers: ['+63 954 402 6187'],
  },
  {
    group: 'hospital', name: 'St. John Hospital, Inc.',
    address: 'Panganiban Drive, Zone 7, Brgy. Tinago',
    numbers: ['+63 916 592 7512'],
  },
  {
    group: 'hospital', name: 'Naga City Hospital',
    numbers: ['+63 985 072 0233'],
  },
  {
    group: 'redcross', name: 'Philippine Red Cross, Camarines Sur',
    address: 'Panganiban Dr.',
    numbers: ['0951 652 4563'],
  },
  // Only our own barangay is listed. Confirm this number with the barangay hall
  // before launch; other barangays are left to the official list (OFFICIAL_LIST).
  { group: 'barangay', own: true, name: 'Triangulo', person: 'Raymund "Monex" Rully Arevalo', numbers: ['+63 912 107 7211'] },
];
