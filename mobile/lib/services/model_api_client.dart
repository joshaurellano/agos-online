// model_api_client.dart
//
// Shared helper for calling the AGOS backend API.
//
// This used to retry against a second, hardcoded "backup" deployment
// (kBackupModelBaseUrl) whenever the primary host was unreachable. That
// backup host has been removed: it was a second, independently-deployed
// copy of the backend that could quietly drift out of sync with the
// primary (different model weights, different code, no shared state),
// and it duplicated resilience the backend already provides itself.
//
// The backend's own weather layer (see app/weather/persistence.py) keeps
// a last-known-good Open-Meteo response persisted in Upstash Redis, and
// serves it automatically whenever Open-Meteo is unreachable — the same
// safety net the web frontend already relies on (frontend/src/pages/
// Dashboard.jsx just does a plain `fetch(...)` against /api/forecast,
// with no second host of its own). Mobile now does the same: one URL,
// one request, and the backend handles staying up.
import 'dart:convert';
import 'package:http/http.dart' as http;

/// GETs [url] and returns the response once it looks genuinely successful.
///
/// Throws if the request itself fails (timeout, DNS, connection refused,
/// etc.), if the HTTP status is a server error (5xx), or if the JSON body
/// reports `status != "success"` — the backend always returns HTTP 200,
/// even on internal errors (e.g. Open-Meteo down with no usable cache;
/// see WeatherUnavailableError), and reports failure via the JSON body
/// instead of an HTTP error code.
Future<http.Response> fetchModelApi(
  String url, {
  // The backend is hosted on Render's free tier, which spins the service
  // down after ~15 minutes idle. A cold start can take 30-60+ seconds to
  // respond to the first request. The web frontend's plain `fetch()` has
  // no timeout of its own, so it just waits the cold start out — mobile
  // was giving up at 15s and throwing before the backend ever woke up,
  // which is why mobile looked broken while web looked fine.
  Duration timeout = const Duration(seconds: 60),
}) async {
  final uri = Uri.parse(url);
  final res = await http.get(uri).timeout(timeout);

  if (res.statusCode >= 500) {
    throw http.ClientException('Model API returned HTTP ${res.statusCode}', uri);
  }

  final body = jsonDecode(res.body) as Map<String, dynamic>;
  if (body['status'] != 'success') {
    throw http.ClientException(
        'Model API returned status: ${body['status']}', uri);
  }

  return res;
}
