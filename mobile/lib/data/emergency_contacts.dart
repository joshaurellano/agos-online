// emergency_contacts.dart
//
// Emergency numbers shown on the Emergency Numbers screen.
//
// Sources:
//  - Naga City official website (www2.naga.gov.ph): COMCEN hotlines.
//  - My Naga App: BFP, Naga White, hospitals and the Punong Barangay of
//    Triangulo.
//  - 911 (national emergency), 117 (PNP) and 143 (Red Cross) are the
//    nationwide numbers.
//
// Only add numbers you have verified: a wrong number here is worse than none.
// Other barangays' Punong Barangay numbers are intentionally not included;
// the full list is on the official Naga City website.

/// Official site linked from the screen footer.
const String kNagaOfficialSiteUrl = 'https://www2.naga.gov.ph/';
const String kNagaOfficialSiteLabel = 'www2.naga.gov.ph';

/// Shown at the bottom of the Emergency Numbers screen.
const String kEmergencySourceNote =
    'Emergency numbers from Official Naga City website and My Naga App. '
    'For full list please visit';

class EmergencyNumber {
  /// Number as it should be displayed, e.g. "+63 908 885 3000".
  final String display;

  /// Short hint such as "Smart / TNT / Sun". Optional.
  final String? hint;
  const EmergencyNumber(this.display, [this.hint]);

  /// What gets passed to the phone dialer (digits and a leading +).
  String get dial => display.replaceAll(RegExp(r'[^0-9+]'), '');
}

class EmergencyEntry {
  final String name;
  final String? address;
  final String? person; // e.g. the Punong Barangay's name
  final List<EmergencyNumber> numbers;
  const EmergencyEntry({
    required this.name,
    this.address,
    this.person,
    required this.numbers,
  });
}

class EmergencyCategory {
  final String id;
  final String title;
  final String emoji;
  final List<EmergencyEntry> entries;
  const EmergencyCategory({
    required this.id,
    required this.title,
    required this.emoji,
    required this.entries,
  });
}

/// COMCEN (Central Communications Center) is the main 24/7 line: it
/// dispatches ambulance, police and fire teams.
const kComcenNumbers = <EmergencyNumber>[
  EmergencyNumber('(054) 472 3000', 'Landline'),
  EmergencyNumber('0908 885 3000', 'Smart / TNT / Sun'),
  EmergencyNumber('0917 777 2277', 'Globe / TM'),
  EmergencyNumber('0908 525 3000', 'Smart'),
  EmergencyNumber('0963 220 9700', 'Smart'),
  EmergencyNumber('(054) 472 2998', 'Landline'),
];

const kNationalNumbers = <EmergencyEntry>[
  EmergencyEntry(
    name: 'National Emergency Hotline',
    address: 'Police, fire, medical',
    numbers: [EmergencyNumber('911')],
  ),
  EmergencyEntry(
    name: 'PNP Hotline',
    address: 'Philippine National Police',
    numbers: [EmergencyNumber('117')],
  ),
  EmergencyEntry(
    name: 'Philippine Red Cross',
    address: 'Rescue and relief',
    numbers: [EmergencyNumber('143')],
  ),
];

const kEmergencyCategories = <EmergencyCategory>[
  EmergencyCategory(
    id: 'fire',
    title: 'Fire Protection',
    emoji: '🔥',
    entries: [
      EmergencyEntry(
        name: 'BFP - Bureau of Fire Protection',
        address: 'J. Miranda Ave., Zone 5, Brgy. Concepcion Pequeña, Naga City',
        numbers: [
          EmergencyNumber('+63 923 083 9429'),
          EmergencyNumber('(054) 473 8472'),
          EmergencyNumber('(054) 473 2633'),
          EmergencyNumber('(054) 871 6454'),
        ],
      ),
      EmergencyEntry(
        name: 'Naga White - Naga City Filipino-Chinese Volunteer Firefighters Inc.',
        address: '4400 Magsaysay Ave, Naga City',
        numbers: [EmergencyNumber('+63 917 308 1800')],
      ),
    ],
  ),
  EmergencyCategory(
    id: 'hospital',
    title: 'Hospital',
    emoji: '🏥',
    entries: [
      EmergencyEntry(
        name: 'Dr. Nilo O. Roa Memorial Foundation Hospital',
        address: 'Dimasalang St., Zone 3, Brgy. San Francisco, Naga City',
        numbers: [EmergencyNumber('+63 954 402 6187')],
      ),
      EmergencyEntry(
        name: 'Naga City Hospital',
        numbers: [EmergencyNumber('+63 985 072 0233')],
      ),
      EmergencyEntry(
        name: 'Bicol Access Health Centrum',
        address: 'Central Business District II, Zone 4, Brgy. Triangulo, Naga City',
        numbers: [
          EmergencyNumber('+63 927 122 6506'),
          EmergencyNumber('+63 968 855 4602'),
          EmergencyNumber('+63 968 852 5794'),
        ],
      ),
      EmergencyEntry(
        name: 'St. John Hospital, Inc.',
        address: 'Panganiban Drive, Zone 7, Brgy. Tinago, Naga City',
        numbers: [EmergencyNumber('+63 916 592 7512')],
      ),
      EmergencyEntry(
        name: 'NICC Hospital',
        address: 'Roxas Avenue, (Diversion Road), Zone 3, Brgy. Triangulo, Naga City',
        numbers: [
          EmergencyNumber('+63 998 976 2712'),
          EmergencyNumber('+63 917 134 3797'),
        ],
      ),
      EmergencyEntry(
        name: 'USI Mother Seton Hospital',
        address: 'Roxas Avenue (Diversion Road), Zone 3, Brgy. Triangulo, Naga City',
        numbers: [
          EmergencyNumber('+63 947 934 7370'),
          EmergencyNumber('+63 917 809 2843'),
        ],
      ),
    ],
  ),
  EmergencyCategory(
    id: 'barangay',
    title: 'Punong Barangay',
    emoji: '🏘️',
    entries: [
      EmergencyEntry(
        name: 'TRIANGULO',
        person: 'Raymund "Monex" Rully Arevalo',
        numbers: [EmergencyNumber('+63 912 107 7211')],
      ),
    ],
  ),
];
