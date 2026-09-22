import 'dart:async';
import 'dart:io';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/incident_report.dart';
import 'offline_cache.dart';

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

  static const _verifiedCacheKey = 'community_reports_verified';

  /// Same feed as [fetchVerifiedReports], but with an offline fallback: a
  /// live response is saved to disk, and if the request fails the last saved
  /// feed is returned instead (flagged `fromCache`, with when it was saved).
  /// Rethrows only when there's nothing saved either.
  static Future<Cached<List<IncidentReport>>> fetchVerifiedReportsCached() async {
    try {
      final response = await _client
          .from('incident_reports')
          .select('*')
          .eq('status', 'verified')
          .order('created_at', ascending: false)
          .timeout(const Duration(seconds: 15));
      final rows = List<Map<String, dynamic>>.from(response as List);
      unawaited(OfflineCache.writeJson(_verifiedCacheKey, rows));
      return Cached(
        rows.map(IncidentReport.fromMap).toList(),
        fromCache: false,
        savedAt: DateTime.now(),
      );
    } catch (_) {
      final entry = await OfflineCache.readJson(_verifiedCacheKey);
      if (entry != null && entry.data is List) {
        final rows = (entry.data as List).cast<Map<String, dynamic>>();
        return Cached(
          rows.map(IncidentReport.fromMap).toList(),
          fromCache: true,
          savedAt: entry.savedAt,
        );
      }
      rethrow;
    }
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

  /// Like [uploadPhoto], but throws on failure instead of returning null.
  /// The report outbox needs the difference: "the upload failed, try again
  /// when there's signal" must not turn into "send the report without its
  /// photo".
  static Future<String> uploadPhotoStrict(String userId, File photo) async {
    final ext = photo.path.split('.').last;
    final fileName = '${DateTime.now().millisecondsSinceEpoch}.$ext';
    final path = '$userId/$fileName';

    await _client.storage
        .from('incident-photos')
        .upload(path, photo)
        .timeout(const Duration(seconds: 60));
    return _client.storage.from('incident-photos').getPublicUrl(path);
  }

  /// Submits a new resident report. Always starts as 'pending' server-side
  /// (the column default), regardless of what's passed here.
  ///
  /// [id] and [createdAt] are only passed by the offline outbox: a
  /// client-generated id makes a retried send idempotent (a duplicate hits
  /// the primary key instead of creating a second report), and [createdAt]
  /// preserves when the resident actually filed it rather than when it
  /// finally got through.
  static Future<void> submitReport({
    String? id,
    DateTime? createdAt,
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
      if (id != null) 'id': id,
      if (createdAt != null) 'created_at': createdAt.toUtc().toIso8601String(),
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
