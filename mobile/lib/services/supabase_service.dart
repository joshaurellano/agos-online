import 'package:supabase_flutter/supabase_flutter.dart';

class SupabaseService {
  static final SupabaseClient client = Supabase.instance.client;

  static Future<Map<String, dynamic>?> fetchProfile(String userId) async {
    final response = await client
        .from('profiles')
        .select('*, roles(role_desc)')
        .eq('id', userId)
        .single();
    return response;
  }

  static Future<List<Map<String, dynamic>>> fetchRoles() async {
    final response = await client.from('roles').select('*');
    return List<Map<String, dynamic>>.from(response);
  }

  static Future<bool> createUser(Map<String, dynamic> payload) async {
    final session = client.auth.currentSession;
    if (session == null) return false;

    final response = await client.functions.invoke(
      'create-user',
      body: payload,
      headers: {'Authorization': 'Bearer ${session.accessToken}'},
    );

    return response.status == 200;
  }
}