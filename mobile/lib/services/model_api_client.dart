// model_api_client.dart
//
// Shared helper for calling the AGOS flood-prediction model API.
//
// The host is whatever MODEL_API_URL / FORECAST_FLOOD_API_URL point to in
// .env. This used to retry against a backup deployment
// (agos-flood-predict.onrender.com) if the primary host failed, but that
// backup is no longer reliable, so the fallback has been removed — a
// failed request now just fails.
import 'dart:convert';
import 'package:http/http.dart' as http;

/// GETs [primaryUrl]. Throws if the request errors (timeout, DNS,
/// connection refused, etc.), returns a 5xx, or the JSON body reports
/// `status != "success"`.
Future<http.Response> getWithFallback(
  String primaryUrl, {
  Duration timeout = const Duration(seconds: 15),
}) async {
  final primary = Uri.parse(primaryUrl);
  final res = await http.get(primary).timeout(timeout);
  if (res.statusCode >= 500) {
    throw http.ClientException(
        'Model API returned HTTP ${res.statusCode}', primary);
  }
  // The backend always returns HTTP 200, even on internal errors (e.g.
  // Open-Meteo down with no usable cache) — it reports failure via
  // `status: "error"` in the JSON body instead of an HTTP error code.
  final body = jsonDecode(res.body) as Map<String, dynamic>;
  if (body['status'] != 'success') {
    throw http.ClientException(
        'Model API returned status: ${body['status']}', primary);
  }
  return res;
}