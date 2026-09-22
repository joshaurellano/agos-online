// pending_reports_service.dart
//
// The report outbox. A resident filing an incident report is very likely to
// be doing it when connectivity is at its worst — so instead of "couldn't
// submit, check your connection", a report that can't be sent right now is
// saved on the device (text, location, and a private copy of the photo) and
// sent automatically the moment the app is back online.
//
// Delivery is safe to retry: each report gets a client-generated UUID that is
// used as its database id, so if a send succeeds server-side but the
// response is lost on a flaky connection, the retry hits a unique-key error
// which is treated as "already delivered" rather than creating a duplicate.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'connectivity_service.dart';
import 'incident_service.dart';

/// What happened when the resident tapped Submit.
enum ReportSubmitResult { sent, queued }

class PendingReport {
  final String id;
  final String reporterName;
  final String reporterRole;
  final String category;
  final String description;
  final String? photoPath;
  final double? latitude;
  final double? longitude;
  final String? locationLabel;
  final DateTime queuedAt;
  int attempts;
  String? lastError;
  // Once the photo has uploaded, remember its URL so a later retry of the
  // report itself doesn't upload (and orphan) another copy.
  String? uploadedPhotoUrl;

  PendingReport({
    required this.id,
    required this.reporterName,
    required this.reporterRole,
    required this.category,
    required this.description,
    this.photoPath,
    this.latitude,
    this.longitude,
    this.locationLabel,
    required this.queuedAt,
    this.attempts = 0,
    this.lastError,
    this.uploadedPhotoUrl,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'reporterName': reporterName,
        'reporterRole': reporterRole,
        'category': category,
        'description': description,
        'photoPath': photoPath,
        'latitude': latitude,
        'longitude': longitude,
        'locationLabel': locationLabel,
        'queuedAt': queuedAt.toIso8601String(),
        'attempts': attempts,
        'lastError': lastError,
        'uploadedPhotoUrl': uploadedPhotoUrl,
      };

  factory PendingReport.fromJson(Map<String, dynamic> j) => PendingReport(
        id: j['id'] as String,
        reporterName: j['reporterName'] as String? ?? 'Resident',
        reporterRole: j['reporterRole'] as String? ?? 'Resident',
        category: j['category'] as String? ?? 'Flood',
        description: j['description'] as String? ?? '',
        photoPath: j['photoPath'] as String?,
        latitude: (j['latitude'] as num?)?.toDouble(),
        longitude: (j['longitude'] as num?)?.toDouble(),
        locationLabel: j['locationLabel'] as String?,
        queuedAt: DateTime.tryParse(j['queuedAt'] as String? ?? '') ?? DateTime.now(),
        attempts: (j['attempts'] as num?)?.toInt() ?? 0,
        lastError: j['lastError'] as String?,
        uploadedPhotoUrl: j['uploadedPhotoUrl'] as String?,
      );
}

class PendingReportsService extends ChangeNotifier {
  final List<PendingReport> _items = [];
  bool _flushing = false;
  Directory? _dir;
  StreamSubscription<void>? _reconnectSub;

  List<PendingReport> get items => List.unmodifiable(_items);
  int get count => _items.length;
  bool get isFlushing => _flushing;

  /// Loads the saved queue and starts listening for connectivity returning.
  /// Call once at startup (main.dart does).
  Future<void>? _initFuture;
  // Shared future so callers can `await init()` and know the saved queue has
  // actually been read, no matter who called first.
  Future<void> init() => _initFuture ??= _init();

  Future<void> _init() async {
    try {
      final dir = await _outboxDir();
      final file = File('${dir.path}${Platform.pathSeparator}queue.json');
      if (await file.exists()) {
        final list = jsonDecode(await file.readAsString()) as List;
        _items
          ..clear()
          ..addAll(list.map((e) => PendingReport.fromJson(e as Map<String, dynamic>)));
        notifyListeners();
      }
    } catch (e) {
      debugPrint('AGOS: outbox load failed: $e');
    }
    _reconnectSub = ConnectivityService.instance.onReconnected.listen((_) => flush());
  }

  Future<Directory> _outboxDir() async {
    final existing = _dir;
    if (existing != null) return existing;
    final base = await getApplicationSupportDirectory();
    final dir = Directory('${base.path}${Platform.pathSeparator}agos_outbox');
    if (!await dir.exists()) await dir.create(recursive: true);
    return _dir = dir;
  }

  Future<void> _persist() async {
    try {
      final dir = await _outboxDir();
      final file = File('${dir.path}${Platform.pathSeparator}queue.json');
      final tmp = File('${file.path}.tmp');
      await tmp.writeAsString(jsonEncode(_items.map((e) => e.toJson()).toList()), flush: true);
      await tmp.rename(file.path);
    } catch (e) {
      debugPrint('AGOS: outbox persist failed: $e');
    }
  }

  /// Saves a report on the device to be sent later. Copies the photo into
  /// the app's own storage first — the camera/gallery temp file the picker
  /// hands back can be deleted by the OS before signal returns.
  Future<PendingReport> enqueue({
    // Pass the same id used for a direct send attempt that may have reached
    // the server before timing out, so delivering the queued copy later is
    // recognized as a duplicate instead of creating a second report.
    String? reportId,
    required String reporterName,
    required String reporterRole,
    required String category,
    required String description,
    File? photo,
    double? latitude,
    double? longitude,
    String? locationLabel,
  }) async {
    final id = reportId ?? _uuidV4();
    String? savedPhotoPath;
    if (photo != null) {
      try {
        final dir = await _outboxDir();
        final dot = photo.path.lastIndexOf('.');
        final ext = dot >= 0 ? photo.path.substring(dot) : '.jpg';
        final copy = await photo.copy('${dir.path}${Platform.pathSeparator}photo_$id$ext');
        savedPhotoPath = copy.path;
      } catch (e) {
        debugPrint('AGOS: could not copy report photo into outbox: $e');
      }
    }
    final item = PendingReport(
      id: id,
      reporterName: reporterName,
      reporterRole: reporterRole,
      category: category,
      description: description,
      photoPath: savedPhotoPath,
      latitude: latitude,
      longitude: longitude,
      locationLabel: locationLabel,
      queuedAt: DateTime.now(),
    );
    _items.add(item);
    await _persist();
    notifyListeners();
    return item;
  }

  /// Discards a queued report (and its saved photo) without sending it.
  Future<void> discard(String id) async {
    final idx = _items.indexWhere((e) => e.id == id);
    if (idx < 0) return;
    await _remove(_items[idx]);
    notifyListeners();
  }

  Future<void> _remove(PendingReport item) async {
    _items.removeWhere((e) => e.id == item.id);
    final path = item.photoPath;
    if (path != null) {
      try {
        final f = File(path);
        if (await f.exists()) await f.delete();
      } catch (_) {}
    }
    await _persist();
  }

  bool _supabaseReady() {
    try {
      // ignore: unnecessary_statements
      Supabase.instance.client;
      return true;
    } catch (_) {
      // Not initialized yet (still on the splash screen) — flush again later.
      return false;
    }
  }

  /// Tries to send everything queued, oldest first. Returns how many were
  /// delivered. Stops at the first network failure (no point hammering a dead
  /// connection); a report the server itself rejects is kept, with the reason
  /// recorded, and the rest continue.
  Future<int> flush() async {
    if (_flushing || _items.isEmpty || !_supabaseReady()) return 0;
    _flushing = true;
    notifyListeners();
    var sent = 0;
    try {
      for (final item in List<PendingReport>.of(_items)) {
        try {
          final client = Supabase.instance.client;
          if (client.auth.currentUser == null) {
            // First launch happened offline, so the silent anonymous sign-in
            // never ran. Do it now that we have signal.
            await client.auth.signInAnonymously();
          }
          final userId = client.auth.currentUser?.id;
          if (userId == null) throw StateError('No anonymous session available yet');

          if (item.photoPath != null && item.uploadedPhotoUrl == null) {
            final f = File(item.photoPath!);
            if (await f.exists()) {
              item.uploadedPhotoUrl = await IncidentService.uploadPhotoStrict(userId, f);
              await _persist();
            }
          }

          await _send(item, userId);
          await _remove(item);
          sent++;
        } on PostgrestException catch (e) {
          if (e.code == '23505') {
            // Unique violation on our own client-generated id: an earlier
            // attempt did reach the server. It's delivered.
            await _remove(item);
            sent++;
          } else {
            item.attempts++;
            item.lastError = e.message;
            await _persist();
          }
        } catch (e) {
          item.attempts++;
          if (isNetworkError(e)) {
            // No point hammering a dead connection — stop here and wait
            // for the next reconnect.
            item.lastError = "Couldn't reach the server";
            await _persist();
            break;
          }
          // Not a connectivity problem (auth, storage policy, ...): keep
          // this report with the reason recorded, and carry on with the
          // rest of the queue rather than letting one bad item block it.
          item.lastError = e.toString();
          await _persist();
        }
        notifyListeners();
      }
    } finally {
      _flushing = false;
      notifyListeners();
    }
    return sent;
  }

  Future<void> _send(PendingReport item, String userId) async {
    Future<void> submit({DateTime? createdAt}) => IncidentService.submitReport(
          id: item.id,
          createdAt: createdAt,
          reportedBy: userId,
          reporterName: item.reporterName,
          reporterRole: item.reporterRole,
          category: item.category,
          description: item.description,
          photoUrl: item.uploadedPhotoUrl,
          latitude: item.latitude,
          longitude: item.longitude,
          locationLabel: item.locationLabel,
        );

    try {
      await submit(createdAt: item.queuedAt);
    } on PostgrestException catch (e) {
      if (e.code == '23505') rethrow; // handled by flush(): already delivered
      // The server may not accept a client-supplied timestamp (column
      // privileges, a trigger). Losing the exact filing time is better than
      // never delivering the report, so retry once without it.
      await submit();
    }
  }

  @override
  void dispose() {
    _reconnectSub?.cancel();
    super.dispose();
  }
}

String _uuidV4() {
  final r = Random.secure();
  final b = List<int>.generate(16, (_) => r.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  String h(int i) => b[i].toRadixString(16).padLeft(2, '0');
  return '${h(0)}${h(1)}${h(2)}${h(3)}-${h(4)}${h(5)}-${h(6)}${h(7)}-'
      '${h(8)}${h(9)}-${h(10)}${h(11)}${h(12)}${h(13)}${h(14)}${h(15)}';
}

/// A fresh client-side report id (UUID v4). See [PendingReportsService.enqueue].
String newReportId() => _uuidV4();
