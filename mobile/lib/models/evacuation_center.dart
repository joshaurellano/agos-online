import 'package:flutter/material.dart';

/// Colors mirror the web dashboard: Primary = red, School = blue, so the
/// marker/card color itself communicates the center's role at a glance.
const kEvacColorPrimary = Color(0xFFDC143C);
const kEvacColorSchool = Color(0xFF3B82F6);

/// An evacuation center, either pulled live from Supabase's
/// `evacuation_centers` table (so a barangay official can mark one closed
/// or full without an app release) or one of the bundled [kDefaultCenters]
/// used as an offline/first-load fallback if that fetch fails.
class EvacuationCenter {
  final String id;
  final String name;
  final String type;
  final String note;
  final double lat;
  final double lng;
  final Color color;
  final bool isOpen;
  final int? capacity;
  final int? currentOccupancy;

  const EvacuationCenter({
    required this.id,
    required this.name,
    required this.type,
    required this.note,
    required this.lat,
    required this.lng,
    required this.color,
    this.isOpen = true,
    this.capacity,
    this.currentOccupancy,
  });

  bool get isFull =>
      capacity != null && currentOccupancy != null && currentOccupancy! >= capacity!;

  factory EvacuationCenter.fromMap(Map<String, dynamic> map) {
    return EvacuationCenter(
      id: map['id'] as String,
      name: map['name'] as String? ?? 'Evacuation Center',
      type: map['type'] as String? ?? 'Evacuation Center',
      note: map['address'] as String? ?? '',
      lat: (map['latitude'] as num).toDouble(),
      lng: (map['longitude'] as num).toDouble(),
      color: (map['type'] as String? ?? '').toLowerCase().contains('primary')
          ? kEvacColorPrimary
          : kEvacColorSchool,
      isOpen: map['is_open'] as bool? ?? true,
      capacity: map['capacity'] as int?,
      currentOccupancy: map['current_occupancy'] as int?,
    );
  }
}

/// Bundled fallback list — used the moment this screen mounts (so there's
/// never a blank map while the network fetch is in flight) and again if
/// that fetch fails outright (no connectivity, table missing, etc). Kept
/// in sync manually; the live Supabase table is the source of truth once
/// it's reachable.
const kDefaultCenters = <EvacuationCenter>[
  EvacuationCenter(
    id: 'jesse-robredo',
    name: 'Jesse M. Robredo Coliseum',
    type: 'Primary Evacuation Center',
    note: 'Ninoy and Cory Avenue, corner Carnation Street, Barangay Triangulo, Naga City',
    lat: 13.620122,
    lng: 123.188095,
    color: kEvacColorPrimary,
  ),
  EvacuationCenter(
    id: 'triangulo-elem',
    name: 'Triangulo Elementary School',
    type: 'School Evacuation Center',
    note: 'Roxas Ave. Diversion Rd. Barangay Triangulo, Naga City',
    lat: 13.6165193,
    lng: 123.1878926,
    color: kEvacColorSchool,
  ),
  EvacuationCenter(
    id: 'jose-rizal-elem',
    name: 'Jose Rizal Elementary School',
    type: 'School Evacuation Center',
    note: 'Ilang Ilang St., Naga City Subd., Zone 1, Brgy. Triangulo, Naga City',
    lat: 13.6194395,
    lng: 123.1933071,
    color: kEvacColorSchool,
  ),
];
