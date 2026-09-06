// model_api_client.dart
//
// Shared helper for calling the AGOS flood-prediction model API with an
// automatic fallback host.
//
// The primary host is whatever MODEL_API_URL / FORECAST_FLOOD_API_URL
// point to in .env. If that host can't be reached (deploy is asleep, DNS
// hiccup, etc.), we retry the exact same path/query against the backup
// deployment below before giving up — the backup exposes the identical
// endpoints (/api/predict-flood, /api/forecast-flood), so only the
// scheme+host need to change.
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// Backup model server. Same API shape as the primary; only used when the
/// primary host is unreachable or erroring.
const String kBackupModelBaseUrl = 'https://agos-flood-predict.onrender.com';

Uri _onBackupHost(Uri original) {
  final backup = Uri.parse(kBackupModelBaseUrl);
  return original.replace(
    scheme: backup.scheme,
    host: backup.host,
    port: backup.hasPort ? backup.port : null,
  );
}

/// GETs [primaryUrl]. If the request throws (timeout, DNS, connection
/// refused, etc.) or comes back with a server error (5xx), retries the
/// same path/query against [kBackupModelBaseUrl] once. Only the second
/// attempt's exception/response is propagated if both fail.
Future<http.Response> getWithFallback(
  String primaryUrl, {
  Duration timeout = const Duration(seconds: 15),
}) async {
  final primary = Uri.parse(primaryUrl);
  try {
    final res = await http.get(primary).timeout(timeout);
    if (res.statusCode >= 500) {
      throw http.ClientException(
          'Primary model API returned HTTP ${res.statusCode}', primary);
    }
    // The backend always returns HTTP 200, even on internal errors (e.g.
    // Open-Meteo down with no usable cache) — it reports failure via
    // `status: "error"` in the JSON body instead of an HTTP error code.
    // Without this check, statusCode < 500 is always true and we'd never
    // fall back to the backup host.
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (body['status'] != 'success') {
      throw http.ClientException(
          'Primary model API returned status: ${body['status']}', primary);
    }
    return res;
  } catch (e) {
    final backup = _onBackupHost(primary);
    debugPrint(
        'AGOS: primary model API failed ($primary): $e — falling back to $backup');
    final res = await http.get(backup).timeout(timeout);
    if (res.statusCode >= 500) {
      throw http.ClientException(
          'Backup model API returned HTTP ${res.statusCode}', backup);
    }
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (body['status'] != 'success') {
      throw http.ClientException(
          'Backup model API returned status: ${body['status']}', backup);
    }
    return res;
  }
}