import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/user_model.dart';
import 'supabase_service.dart';

const _cachedProfileKey = 'agos_cached_profile_json';

class AuthService extends ChangeNotifier {
  UserModel? _currentUser;
  String?    _error;
  bool       _isLoading = true;
  // True when we're showing a cached profile because the live fetch
  // failed (most likely no connectivity) rather than a fresh one.
  bool       _isOffline = false;

  UserModel? get currentUser => _currentUser;
  String?    get error       => _error;
  bool       get isLoading   => _isLoading;
  bool       get isOffline   => _isOffline;

  AuthService() {
    _init();
  }

  void _init() {
    Supabase.instance.client.auth.onAuthStateChange.listen((data) async {
      final session = data.session;
      if (session != null) {
        await _fetchProfile(session.user.id);
      } else {
        _currentUser = null;
        _isLoading = false;
        notifyListeners();
      }
    });
  }

  Future<void> _fetchProfile(String userId) async {
    try {
      final data = await SupabaseService.fetchProfile(userId);
      if (data != null) {
        _currentUser = UserModel.fromMap(data);
        _isOffline = false;
        _cacheProfile(data); // fire-and-forget; not critical to await
      }
    } catch (e) {
      // A failed fetch here is most often "no connectivity right now",
      // not "this session is invalid" — Supabase's own auth listener
      // already handles the real logged-out case by passing session:
      // null above. Kicking a resident back to the login screen just
      // because the network hiccuped is exactly wrong during a flood,
      // when connectivity is most likely to drop and residents most
      // need whatever the app already has. Fall back to the last
      // profile we cached for this device instead of clearing the user.
      debugPrint('AGOS: Profile fetch failed, trying cached profile: $e');
      final cached = await _loadCachedProfile();
      if (cached != null) {
        _currentUser = UserModel.fromMap(cached);
        _isOffline = true;
      } else {
        // No cache and no network — nothing to show, so this is a
        // genuine "can't sign you in right now" state.
        _currentUser = null;
      }
    }
    _isLoading = false;
    notifyListeners();
  }

  Future<void> _cacheProfile(Map<String, dynamic> data) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_cachedProfileKey, jsonEncode(data));
    } catch (e) {
      debugPrint('AGOS: Failed to cache profile: $e');
    }
  }

  Future<Map<String, dynamic>?> _loadCachedProfile() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final str = prefs.getString(_cachedProfileKey);
      if (str == null) return null;
      return jsonDecode(str) as Map<String, dynamic>;
    } catch (e) {
      debugPrint('AGOS: Failed to load cached profile: $e');
      return null;
    }
  }

  Future<bool> login(String username, String password) async {
    _error = null;
    notifyListeners();
    final email = '$username@agos.local';
    try {
      await Supabase.instance.client.auth.signInWithPassword(
        email: email,
        password: password,
      );
      return true;
    } catch (_) {
      _error = 'Invalid username or password.';
      notifyListeners();
      return false;
    }
  }

  Future<bool> createUser(Map<String, dynamic> payload) async {
    _error = null;
    notifyListeners();
    try {
      final ok = await SupabaseService.createUser(payload);
      if (!ok) {
        _error = 'Something went wrong creating the user.';
        notifyListeners();
      }
      return ok;
    } catch (_) {
      _error = 'Something went wrong.';
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    await Supabase.instance.client.auth.signOut();
    _currentUser = null;
    _error = null;
    _isOffline = false;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_cachedProfileKey);
    } catch (e) {
      debugPrint('AGOS: Failed to clear cached profile: $e');
    }
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }
}