/// A real-time, resident-submitted flood report ("flooding on my street
/// right now", "umaabot na sa tuhod", etc.) — distinct from the formal
/// `flood_reports` staff log used on the web dashboard. These start as
/// `pending` and only appear in the community feed once a barangay
/// official verifies them.
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
      category:        map['category'] as String? ?? 'Flood',
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
///
/// Residents can only file flood reports — other incident types (power
/// outages, road accidents, medical emergencies, etc.) were removed so the
/// community feed stays focused on real-time flood conditions.
const kIncidentCategories = <String>['Flood'];


/// Quick-pick details a resident can attach to a flood report. They are
/// stored as a leading "[Knee-deep · Not passable]" tag on the description, so
/// no database change is needed, and the feed turns the tag back into chips.
/// (Depth + passability are the two things neighbours and officials most want
/// to know at a glance; "umaabot na sa tuhod" in free text is easy to miss.)
const kDepthOptions = <String>['Ankle-deep', 'Knee-deep', 'Waist-deep', 'Chest-deep or higher'];
const kRoadOptions = <String>['Passable', 'High vehicles only', 'Not passable'];

class ReportTags {
  const ReportTags._();

  /// "[Knee-deep · Not passable] text" (either tag, or the text, may be absent).
  static String build(String? depth, String? road, String text) {
    final tags = [if (depth != null) depth, if (road != null) road];
    if (tags.isEmpty) return text;
    final head = '[${tags.join(' · ')}]';
    return text.isEmpty ? head : '$head $text';
  }

  static ({List<String> tags, String text}) parse(String description) {
    final m = RegExp(r'^\[(.+?)\]\s*').firstMatch(description);
    if (m == null) return (tags: const <String>[], text: description);
    final tags = m.group(1)!.split('·').map((e) => e.trim()).where((e) => e.isNotEmpty).toList();
    return (tags: tags, text: description.substring(m.end));
  }
}
