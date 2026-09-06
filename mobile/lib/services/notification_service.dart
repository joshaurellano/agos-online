import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

// ─── Must be top-level (not inside a class) ────────────────────────────────────
// Called when a notification arrives while the app is fully terminated/background.
@pragma('vm:entry-point')
Future<void> _firebaseBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  // flutter_local_notifications displays it automatically via the
  // high-importance channel — nothing else needed here.
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

  // Android needs an explicit high-importance channel for heads-up alerts
  static const _channel = AndroidNotificationChannel(
    'agos_alerts',                          // must match channel_id in Edge Function
    'AGOS Flood Alerts',
    description: 'Real-time flood alert notifications for Barangay Triangulo',
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

    // 2. Create the Android notification channel
    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);

    // 3. Ask for permission (Android 13+, iOS)
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    debugPrint('[FCM] Permission: ${settings.authorizationStatus}');

    // 4. Show notifications in foreground on iOS too
    await _messaging.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );

    // 5. Set up flutter_local_notifications
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings     = DarwinInitializationSettings(
      requestAlertPermission: false,  // already requested above
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await _localNotifications.initialize(
      settings: const InitializationSettings(android: androidSettings, iOS: iosSettings),
      onDidReceiveNotificationResponse: _onNotificationTap,
    );

    // 6. Save this device's FCM token to Supabase
    await _registerToken();
    // Refresh whenever Firebase rotates the token
    _messaging.onTokenRefresh.listen(_saveToken);

    // 7. Foreground message → show a local heads-up notification
    FirebaseMessaging.onMessage.listen((message) {
      debugPrint('[FCM] onMessage fired');
      debugPrint('[FCM] title: ${message.notification?.title}');
      debugPrint('[FCM] data: ${message.data}');
      _onForegroundMessage(message);
    });

    // 8. User tapped a notification while app was in background (not terminated)
    FirebaseMessaging.onMessageOpenedApp.listen(_onNotificationOpened);

    // 9. User tapped a notification that launched the app from terminated state
    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) _onNotificationOpened(initialMessage);
  }

  // ── FCM Topic subscription ─────────────────────────────────────────────────
  Future<void> subscribeToAlerts() async {
    await _messaging.subscribeToTopic('flood_alerts');
    debugPrint('[FCM] Subscribed to flood_alerts topic');  // ← add this

    // Notified when a barangay official verifies a resident-submitted
    // incident report (see supabase/functions/on-incident-verified).
    await _messaging.subscribeToTopic('community_reports');
    debugPrint('[FCM] Subscribed to community_reports topic');
  }

  // ── Token management ───────────────────────────────────────────────────────
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
      debugPrint('[FCM] Token saved');
    } catch (e) {
      debugPrint('[FCM] Failed to save token: $e');
    }
  }

  // ── Foreground message ─────────────────────────────────────────────────────
  Future<void> _onForegroundMessage(RemoteMessage message) async {
    final level = message.data['level'] as String? ?? 'normal';
    final type  = message.data['type']  as String? ?? 'alert';
    final title = message.notification?.title ?? '${_emoji(level)} AGOS Alert';
    final body  = message.notification?.body  ?? message.data['message'] ?? '';

    await _localNotifications.show(
      id: message.hashCode,
      title: title,
      body: body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance:    Importance.max,
          priority:      Priority.high,
          color:         _color(level),
          icon:          '@mipmap/ic_launcher',
          styleInformation: BigTextStyleInformation(body),
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      // Carries the notification "type" (alert vs. community_report) so a
      // tap on this local notification (see _onNotificationTap below) can
      // route to the right screen, same as a tap from the system tray.
      payload: type,
    );
  }

  // ── Notification tap handlers ──────────────────────────────────────────────
  void _onNotificationOpened(RemoteMessage message) {
    _routeForType(message.data['type'] as String?);
  }

  void _onNotificationTap(NotificationResponse response) {
    _routeForType(response.payload);
  }

  void _routeForType(String? type) {
    final route = type == 'community_report' ? '/community-reports' : '/alert';
    navigatorKey.currentState?.pushNamedAndRemoveUntil(
      route,
      (route) => route.isFirst,
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  String _emoji(String level) {
    switch (level.toUpperCase()) {
      case 'CRITICAL':  return '🔴';
      case 'WARNING':   return '🟠';
      case 'ADVISORY':  return '🟡';
      default:          return '🟢';
    }
  }

  Color _color(String level) {
    switch (level.toUpperCase()) {
      case 'CRITICAL':  return const Color(0xFFEF4444);
      case 'WARNING':   return const Color(0xFFF97316);
      case 'ADVISORY':  return const Color(0xFFEAB308);
      default:          return const Color(0xFF22C55E);
    }
  }
}