import 'dart:io';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/incident_report.dart';

class IncidentService {
  static SupabaseClient get _client => Supabase.instance.client;

  /// Verified reports only — this is what every resident sees in the
  /// community feed. RLS also enforces this server-side, so even a
  /// modified client can't pull back pending/rejected reports it
  /// doesn't own.
  static Future<List<IncidentReport>> fetchVerifiedReports() async {
    final response = await _client
        .from('incident_reports')
        .select('*')
        .eq('status', 'verified')
        .order('created_at', ascending: false);
    return (response as List)
        .map((e) => IncidentReport.fromMap(e as Map<String, dynamic>))
        .toList();
  }

  /// A resident's own submissions, whatever their status, so they can see
  /// "still pending" / "verified" / "rejected" on what they personally sent in.
  static Future<List<IncidentReport>> fetchMyReports(String userId) async {
    final response = await _client
        .from('incident_reports')
        .select('*')
        .eq('reported_by', userId)
        .order('created_at', ascending: false);
    return (response as List)
        .map((e) => IncidentReport.fromMap(e as Map<String, dynamic>))
        .toList();
  }

  /// Realtime stream of verified reports, so the community feed updates
  /// the moment an official verifies something — no manual refresh needed.
  static Stream<List<IncidentReport>> streamVerifiedReports() {
    return _client
        .from('incident_reports')
        .stream(primaryKey: ['id'])
        .order('created_at', ascending: false)
        .map((rows) => rows
            .where((r) => r['status'] == 'verified')
            .map((e) => IncidentReport.fromMap(e))
            .toList());
  }

  /// Uploads a photo to the `incident-photos` bucket under the user's own
  /// folder (required by the storage RLS policy) and returns its public URL.
  static Future<String?> uploadPhoto(String userId, File photo) async {
    try {
      final ext = photo.path.split('.').last;
      final fileName = '${DateTime.now().millisecondsSinceEpoch}.$ext';
      final path = '$userId/$fileName';

      await _client.storage.from('incident-photos').upload(path, photo);
      return _client.storage.from('incident-photos').getPublicUrl(path);
    } catch (e) {
      // Photo upload failing shouldn't block the whole report — the
      // description and location are still useful on their own.
      return null;
    }
  }

  /// Submits a new resident report. Always starts as 'pending' server-side
  /// (the column default), regardless of what's passed here.
  static Future<void> submitReport({
    required String reportedBy,
    required String reporterName,
    required String reporterRole,
    required String category,
    required String description,
    String? photoUrl,
    double? latitude,
    double? longitude,
    String? locationLabel,
  }) async {
    await _client.from('incident_reports').insert({
      'reported_by':    reportedBy,
      'reporter_name':  reporterName,
      'reporter_role':  reporterRole,
      'category':       category,
      'description':    description,
      'photo_url':      photoUrl,
      'latitude':       latitude,
      'longitude':      longitude,
      'location_label': locationLabel,
    });
  }

  /// Lets a resident retract their own report while it's still pending.
  static Future<void> deleteOwnPendingReport(String id) async {
    await _client.from('incident_reports').delete().eq('id', id);
  }
}
