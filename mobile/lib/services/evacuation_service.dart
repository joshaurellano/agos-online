import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/evacuation_center.dart';

/// Reads the `evacuation_centers` table so a barangay official can mark a
/// center closed/full, or add a new one, without an app store release.
/// Every call point falls back to [kDefaultCenters] on any failure —
/// no connectivity, table not created yet, RLS misconfigured — so this
/// screen never ends up with an empty list.
class EvacuationService {
  static SupabaseClient get _client => Supabase.instance.client;

  static Future<List<EvacuationCenter>> fetchCenters() async {
    try {
      final response = await _client
          .from('evacuation_centers')
          .select('*')
          .order('name');
      final rows = response as List;
      if (rows.isEmpty) return kDefaultCenters;
      return rows
          .map((e) => EvacuationCenter.fromMap(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return kDefaultCenters;
    }
  }
}
