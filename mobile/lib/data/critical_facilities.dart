import 'package:flutter/material.dart';

// ─── Critical Facilities ────────────────────────────────────────────────────
// Mobile counterpart of the web dashboard's `src/data/criticalFacilities.js`:
// a Project-NOAH-style "exposure" layer (hospitals/clinics, schools, and the
// responders people call on) shown against the flood map so residents can see
// what sits inside the barangay. Deliberately separate from the evacuation
// centers on the Evacuation screen (evacuation_screen.dart) -- a school can be
// BOTH a place children study every day AND a designated evacuation site, but
// the two lists answer different questions ("is this facility here?" vs
// "where do I go?") and are allowed to overlap.
//
// Coordinates mirror the same verified/ground-truthed set used on the web
// dashboard (Sep 2026).

enum FacilityType { hospital, clinic, school, police, fireStation }

class CriticalFacility {
  final String id;
  final String name;
  final FacilityType type;
  final double lat;
  final double lng;

  const CriticalFacility({
    required this.id,
    required this.name,
    required this.type,
    required this.lat,
    required this.lng,
  });
}

// Shared styling so this layer looks consistent with the web dashboard's
// version. Colors intentionally avoid the alert-severity palette
// (green/yellow/orange/red) and the hazard-legend palette (blue/amber/red)
// so a facility pin/card is never mistaken for a severity signal.
class FacilityStyle {
  final Color color;
  final String label;
  final IconData icon;

  const FacilityStyle({
    required this.color,
    required this.label,
    required this.icon,
  });
}

const Map<FacilityType, FacilityStyle> kFacilityStyles = {
  FacilityType.hospital: FacilityStyle(
    color: Color(0xFFEC4899),
    label: 'Hospital',
    icon: Icons.local_hospital_rounded,
  ),
  FacilityType.clinic: FacilityStyle(
    color: Color(0xFF14B8A6),
    label: 'Clinic / Health Station',
    icon: Icons.medical_services_rounded,
  ),
  FacilityType.school: FacilityStyle(
    color: Color(0xFF8B5CF6),
    label: 'School',
    icon: Icons.school_rounded,
  ),
  FacilityType.police: FacilityStyle(
    color: Color(0xFF6366F1),
    label: 'Police',
    icon: Icons.local_police_rounded,
  ),
  FacilityType.fireStation: FacilityStyle(
    color: Color(0xFFFB923C),
    label: 'Fire Station',
    icon: Icons.local_fire_department_rounded,
  ),
};

// Display order for filter chips / legends -- hospitals and clinics first
// since they're the highest-stakes lookup during a flood, then schools, then
// the responder categories. Mirrors FACILITY_TYPE_ORDER on the web dashboard.
const List<FacilityType> kFacilityTypeOrder = [
  FacilityType.hospital,
  FacilityType.clinic,
  FacilityType.school,
  FacilityType.police,
  FacilityType.fireStation,
];

const List<CriticalFacility> kCriticalFacilities = [
  CriticalFacility(
    id: 'nicc-doctors-hospital',
    name: 'Nicc Doctors Hospital',
    type: FacilityType.hospital,
    lat: 13.616257862678793,
    lng: 123.19336183372815,
  ),
  CriticalFacility(
    id: 'bicol-access-health-centrum',
    name: 'Bicol Access Health Centrum',
    type: FacilityType.clinic,
    lat: 13.618898957592357,
    lng: 123.1923624054582,
  ),
  CriticalFacility(
    id: 'triangulo-elementary-school',
    name: 'Triangulo Elementary School',
    type: FacilityType.school,
    lat: 13.616665295547357,
    lng: 123.19085913810308,
  ),
  CriticalFacility(
    id: 'ina-birthing-family-planning-clinic',
    name: 'Ina Birthing And Family Planning Clinic',
    type: FacilityType.clinic,
    lat: 13.621772533476271,
    lng: 123.19322369980672,
  ),
  CriticalFacility(
    id: 'jose-rizal-elementary-school',
    name: 'Jose Rizal Elementary School',
    type: FacilityType.school,
    lat: 13.619575066533239,
    lng: 123.1966276896565,
  ),
  CriticalFacility(
    id: 'chin-po-tong-volunteer-fire-brigade',
    name: 'Chin Po Tong Volunteer Fire Brigade',
    type: FacilityType.fireStation,
    lat: 13.619955801678392,
    lng: 123.19272649755152,
  ),
  CriticalFacility(
    id: 'naga-city-police-station-5',
    name: 'Naga City Police Station 5',
    type: FacilityType.police,
    lat: 13.619081276593883,
    lng: 123.19033990258485,
  ),
  CriticalFacility(
    id: 'st-john-hospital-inc',
    name: 'St. John Hospital, Inc.',
    type: FacilityType.hospital,
    lat: 13.622928272564026,
    lng: 123.19093833993082,
  ),
  CriticalFacility(
    id: 'bicol-medical-center',
    name: 'Bicol Medical Center',
    type: FacilityType.hospital,
    lat: 13.623320661205083,
    lng: 123.19962881054649,
  ),
  CriticalFacility(
    id: 'lerma-barangay-health-station',
    name: 'Lerma Barangay Health Station',
    type: FacilityType.clinic,
    lat: 13.622610848581944,
    lng: 123.18804515657366,
  ),
  CriticalFacility(
    id: 'naga-city-police-station-2',
    name: 'Naga City Police Station 2',
    type: FacilityType.police,
    lat: 13.611673381247206,
    lng: 123.21295568965647,
  ),
];
