/// A real-time, resident-submitted report ("flooding on my street right
/// now", "may sunog", etc.) — distinct from the formal `flood_reports`
/// staff log used on the web dashboard. These start as `pending` and only
/// appear in the community feed once a barangay official verifies them.
class IncidentReport {
  final String id;
  final String? reportedBy;
  final String reporterName;
  final String reporterRole;
  final String category;
  final String description;
  final String? photoUrl;
  final double? latitude;
  final double? longitude;
  final String? locationLabel;
  final String status; // pending | verified | rejected
  final String? rejectionReason;
  final DateTime createdAt;

  const IncidentReport({
    required this.id,
    this.reportedBy,
    required this.reporterName,
    required this.reporterRole,
    required this.category,
    required this.description,
    this.photoUrl,
    this.latitude,
    this.longitude,
    this.locationLabel,
    required this.status,
    this.rejectionReason,
    required this.createdAt,
  });

  bool get isPending  => status == 'pending';
  bool get isVerified => status == 'verified';
  bool get isRejected => status == 'rejected';

  factory IncidentReport.fromMap(Map<String, dynamic> map) {
    return IncidentReport(
      id:              map['id'] as String,
      reportedBy:      map['reported_by'] as String?,
      reporterName:    map['reporter_name'] as String? ?? 'Resident',
      reporterRole:    map['reporter_role'] as String? ?? 'Resident',
      category:        map['category'] as String? ?? 'Other',
      description:     map['description'] as String? ?? '',
      photoUrl:        map['photo_url'] as String?,
      latitude:        (map['latitude'] as num?)?.toDouble(),
      longitude:       (map['longitude'] as num?)?.toDouble(),
      locationLabel:   map['location_label'] as String?,
      status:          map['status'] as String? ?? 'pending',
      rejectionReason: map['rejection_reason'] as String?,
      createdAt:       DateTime.parse(map['created_at'] as String),
    );
  }
}

/// Report categories a resident can pick from. Kept in one place so the
/// submission form and any category-based filtering/icon lookups can't
/// drift out of sync with what the database's CHECK constraint allows.
const kIncidentCategories = <String>[
  'Flood',
  'Road Accident',
  'Power Outage',
  'Medical Emergency',
  'Other',
];
