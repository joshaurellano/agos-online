import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

// ─── Must be top-level (not inside a class) ────────────────────────────────────
// Called when a notification arrives while the app is fully terminated/background.
// The push now carries a real FCM `notification` payload (see
// supabase/functions/send-push-notification), so the OS renders it into the
// system tray on its own via the agos_alerts channel — nothing to do here
// beyond making sure Firebase is initialized in case the app process was
// woken up just for this.
@pragma('vm:entry-point')
Future<void> _firebaseBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

// ─── Global navigator key ──────────────────────────────────────────────────────
// Lets us navigate to the Alert tab from a notification tap
// without needing a BuildContext.
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

// ─── Notification Service ──────────────────────────────────────────────────────
class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  final _messaging          = FirebaseMessaging.instance;
  final _localNotifications = FlutterLocalNotificationsPlugin();

  /// FCM topics. Which of these a device is subscribed to is controlled from
  /// Settings → Notifications (see app_settings.dart).
  static const topicFloodAlerts     = 'flood_alerts';
  static const topicCommunityReports = 'community_reports';

  // True once this device's FCM token has been written to Supabase. Stays
  // false if that first attempt happened offline, so it can be retried when
  // connectivity returns (see retryTokenRegistration).
  bool _tokenSaved = false;

  // ── Android notification channels ─────────────────────────────────────────
  // On Android 8+ a channel's sound/vibration/importance are fixed at
  // creation (only the user can change them afterwards), so the alert
  // levels get their own channels rather than one channel for everything:
  //
  //   agos_critical — severe flooding imminent. Plays on the ALARM audio
  //                   stream, so it's heard even with the ringer on silent,
  //                   with a long repeating vibration.
  //   agos_warning  — significant flooding expected. Loud heads-up with a
  //                   distinct vibration, normal notification volume.
  //   agos_alerts   — everything else (advisories, info, community
  //                   updates). This is the original channel id, kept so
  //                   existing installs and the Edge Function still work.
  //
  // The channel a *background* push uses is chosen by the server, via
  // android.notification.channel_id in the FCM payload — see
  // docs/EDGE_FUNCTION_NOTES.md. The channels must exist on the device
  // before then, which is why they're all created in initialize().
  static const channelCritical = 'agos_critical';
  static const channelWarning  = 'agos_warning';
  static const channelDefault  = 'agos_alerts';

  static final _criticalVibration = Int64List.fromList([0, 900, 300, 900, 300, 900]);
  static final _warningVibration  = Int64List.fromList([0, 500, 250, 500]);

  static final _criticalChannel = AndroidNotificationChannel(
    channelCritical,
    'Critical flood alerts',
    description: 'Severe flooding is imminent — evacuate. Plays at alarm volume.',
    importance: Importance.max,
    playSound: true,
    enableVibration: true,
    vibrationPattern: _criticalVibration,
    enableLights: true,
    ledColor: const Color(0xFFEF4444),
    audioAttributesUsage: AudioAttributesUsage.alarm,
  );

  static final _warningChannel = AndroidNotificationChannel(
    channelWarning,
    'Flood warnings',
    description: 'Significant flooding is expected — get ready to evacuate.',
    importance: Importance.max,
    playSound: true,
    enableVibration: true,
    vibrationPattern: _warningVibration,
    enableLights: true,
    ledColor: const Color(0xFFF97316),
  );

  static const _defaultChannel = AndroidNotificationChannel(
    channelDefault,                         // must match channel_id in Edge Function
    'AGOS Flood Alerts',
    description: 'Flood advisories and updates for Barangay Triangulo',
    importance: Importance.max,
    playSound: true,
    enableVibration: true,
    enableLights: true,
    ledColor: Color(0xFF38BDF8),
  );

  // ── Initialize everything ──────────────────────────────────────────────────
  Future<void> initialize() async {
    // 1. Register the background handler
    FirebaseMessaging.onBackgroundMessage(_firebaseBackgroundHandler);

    // 2. Create the Android notification channels (see above)
    final androidImpl = _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    await androidImpl?.createNotificationChannel(_criticalChannel);
    await androidImpl?.createNotificationChannel(_warningChannel);
    await androidImpl?.createNotificationChannel(_defaultChannel);

    // 3. Notification permission is deliberately NOT requested here any
    // more. A permission prompt on the very first frame, with no context,
    // gets refused far more often than one shown after a screen that
    // explains what the alerts are for — so the onboarding flow
    // (screens/onboarding_screen.dart) asks, and Settings → Notifications
    // can ask again. requestPermission() below is what both call.
    debugPrint('[FCM] Permission: ${await permissionStatus()}');

    // 4. Show notifications in foreground on iOS too
    await _messaging.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    // 5. Set up flutter_local_notifications
    // Status-bar icon: a white silhouette in android/app/src/main/res/
    // drawable-*/ic_stat_agos.png. (The colored launcher icon used here
    // before rendered as a plain white square in the status bar.) If you
    // copy the Dart code without the android/ folder, this resource is
    // missing and initialize() will throw "invalid_icon".
    const androidSettings = AndroidInitializationSettings('@drawable/ic_stat_agos');
    const iosSettings     = DarwinInitializationSettings(
      requestAlertPermission: false,  // already requested above
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await _localNotifications.initialize(
      settings: const InitializationSettings(android: androidSettings, iOS: iosSettings),
      // Taps on a notification we displayed ourselves (foreground alerts on
      // Android, see step 7). The test alert has payload 'test' and just
      // dismisses.
      onDidReceiveNotificationResponse: (response) {
        if (response.payload == 'test') return;
        _routeForType(response.payload);
      },
    );

    // 6. Save this device's FCM token to Supabase — in the background.
    // This used to be awaited, but getToken() needs the network on a first
    // launch and can hang for a long time with no signal, which held the
    // splash screen (and so the whole app) hostage. Nothing downstream
    // needs the token before the UI is up; if this attempt fails it's
    // retried on reconnect via retryTokenRegistration().
    unawaited(_registerToken());
    // Refresh whenever Firebase rotates the token
    _messaging.onTokenRefresh.listen(_saveToken);

    // 7. Foreground message. Android does NOT display a push's
    // `notification` payload while the app is open (only iOS does, via
    // setForegroundNotificationPresentationOptions above) — so without this
    // a resident with AGOS open would get no sound, vibration or banner
    // for a Critical alert; it would just quietly appear in the Alerts
    // list. On Android we therefore show it ourselves, on whichever channel
    // the server picked, so it looks and sounds exactly like the
    // background version. iOS is left to the system to avoid a duplicate.
    FirebaseMessaging.onMessage.listen((message) {
      debugPrint('[FCM] onMessage fired (foreground)');
      debugPrint('[FCM] title: ${message.notification?.title}');
      debugPrint('[FCM] data: ${message.data}');
      if (Platform.isAndroid) unawaited(_showForeground(message));
    });

    // 8. User tapped a notification while app was in background (not terminated)
    FirebaseMessaging.onMessageOpenedApp.listen(_onNotificationOpened);

    // 9. User tapped a notification that launched the app from terminated state
    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) _onNotificationOpened(initialMessage);
  }

  // ── FCM Topic subscription ─────────────────────────────────────────────────
  // Applies ONE topic change and reports whether it went through, so the
  // caller (AppSettings) can remember what's actually been applied and retry
  // the rest later. Which topics to be on is decided in Settings, not here.
  //
  // Bounded by a timeout: with no signal FCM's topic calls can stall for a
  // long time rather than failing fast, and a stalled call would block every
  // later sync. A timed-out call may still land server-side; re-sending it
  // later is harmless because subscribe/unsubscribe are idempotent.
  Future<bool> setTopicSubscribed(String topic, bool subscribed) async {
    try {
      final call = subscribed
          ? _messaging.subscribeToTopic(topic)
          : _messaging.unsubscribeFromTopic(topic);
      await call.timeout(const Duration(seconds: 20));
      debugPrint('[FCM] ${subscribed ? 'Subscribed to' : 'Unsubscribed from'} $topic');
      return true;
    } catch (e) {
      debugPrint('[FCM] Topic change failed ($topic → $subscribed): $e');
      return false;
    }
  }

  // ── Permission ─────────────────────────────────────────────────────────────
  Future<AuthorizationStatus> permissionStatus() async {
    try {
      final settings = await _messaging.getNotificationSettings();
      return settings.authorizationStatus;
    } catch (_) {
      return AuthorizationStatus.notDetermined;
    }
  }

  /// Shows the system permission prompt if it can still be shown; otherwise
  /// just returns the current status (the OS won't re-prompt after a denial).
  Future<AuthorizationStatus> requestPermission() async {
    try {
      final settings = await _messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      return settings.authorizationStatus;
    } catch (_) {
      return permissionStatus();
    }
  }

  // ── Token management ───────────────────────────────────────────────────────
  /// Called on reconnect. No-op if the token already made it to Supabase.
  Future<void> retryTokenRegistration() async {
    if (_tokenSaved) return;
    await _registerToken();
  }

  Future<void> _registerToken() async {
    try {
      if (Platform.isIOS) {
        await _messaging.getAPNSToken();
      }
      final token = await _messaging.getToken();
      if (token != null) await _saveToken(token);
    } catch (e) {
      debugPrint('[FCM] Token registration error: $e');
    }
  }

  Future<void> _saveToken(String token) async {
    debugPrint('[FCM] Token: $token');
    try {
      final client = Supabase.instance.client;
      // user_id is nullable — logged-out devices still get alerts
      final userId = client.auth.currentUser?.id;

      await client.from('device_tokens').upsert(
        {
          'token':      token,
          'user_id':    userId,
          'platform':   Platform.isIOS ? 'ios' : 'android',
          'updated_at': DateTime.now().toIso8601String(),
        },
        onConflict: 'token',
      );
      _tokenSaved = true;
      debugPrint('[FCM] Token saved');
    } catch (e) {
      _tokenSaved = false;
      debugPrint('[FCM] Failed to save token: $e');
    }
  }

  // ── Showing a notification ourselves ───────────────────────────────────────
  Future<void> _showForeground(RemoteMessage message) async {
    final n = message.notification;
    if (n == null) return;
    await _show(
      id: message.hashCode & 0x7fffffff,
      title: n.title,
      body: n.body,
      // Whatever channel the server chose for this push; falls back to the
      // general one if the payload didn't name any.
      channelId: n.android?.channelId ?? channelDefault,
      payload: message.data['type'] as String?,
    );
  }

  Future<void> _show({
    required int id,
    required String? title,
    required String? body,
    required String channelId,
    String? payload,
  }) async {
    try {
      final AndroidNotificationDetails android;
      switch (channelId) {
        case channelCritical:
          android = AndroidNotificationDetails(
            channelCritical, 'Critical flood alerts',
            importance: Importance.max,
            priority: Priority.max,
            vibrationPattern: _criticalVibration,
            audioAttributesUsage: AudioAttributesUsage.alarm,
            category: AndroidNotificationCategory.alarm,
            styleInformation: body == null ? null : BigTextStyleInformation(body),
          );
        case channelWarning:
          android = AndroidNotificationDetails(
            channelWarning, 'Flood warnings',
            importance: Importance.max,
            priority: Priority.high,
            vibrationPattern: _warningVibration,
            styleInformation: body == null ? null : BigTextStyleInformation(body),
          );
        default:
          android = AndroidNotificationDetails(
            channelId, 'AGOS Flood Alerts',
            importance: Importance.max,
            priority: Priority.high,
            styleInformation: body == null ? null : BigTextStyleInformation(body),
          );
      }
      await _localNotifications.show(
        id: id,
        title: title,
        body: body,
        notificationDetails: NotificationDetails(android: android),
        payload: payload,
      );
    } catch (e) {
      debugPrint('[FCM] Could not show notification: $e');
    }
  }

  /// Shows a Critical-style test alert so a resident can check — before an
  /// emergency — that AGOS notifications are allowed and audible on their
  /// phone. Used by Settings → Notifications → Send test alert.
  Future<void> showTestAlert() => _show(
        id: 9001,
        title: 'AGOS test alert',
        body: 'If you can see and hear this, critical flood alerts will reach you. This is only a test.',
        channelId: channelCritical,
        payload: 'test',
      );

  // ── Notification tap handlers ──────────────────────────────────────────────
  // Taps on the OS-rendered notification (background/terminated) come
  // through here. Taps on notifications we display ourselves (Android
  // foreground alerts, test alert) come through the local-notifications
  // callback registered in initialize().
  void _onNotificationOpened(RemoteMessage message) {
    _routeForType(message.data['type'] as String?);
  }

  void _routeForType(String? type) {
    final route = type == 'community_report' ? '/community-reports' : '/alert';
    navigatorKey.currentState?.pushNamedAndRemoveUntil(
      route,
      (route) => route.isFirst,
    );
  }
}