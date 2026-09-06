import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../main.dart';
import '../models/alert_level.dart';
import '../services/auth_service.dart';
import '../services/flood_status_service.dart';

// ── Types ──────────────────────────────────────────────────────────────────────

enum _AlertType { critical, warning, advisory, normal, info }

class _AlertLog {
  final int id;
  final String time;
  final _AlertType type;
  final String message;
  final String sentBy;
  bool read;

  _AlertLog({
    required this.id,
    required this.time,
    required this.type,
    required this.message,
    required this.sentBy,
    this.read = false,
  });
}

_AlertType _typeFromKey(String key) {
  switch (key.toUpperCase()) {
    case 'CRITICAL': return _AlertType.critical;
    case 'WARNING':  return _AlertType.warning;
    case 'ADVISORY': return _AlertType.advisory;
    case 'INFO':     return _AlertType.info;
    default:         return _AlertType.normal;
  }
}

const _typeColors = {
  _AlertType.critical: AppColors.red,
  _AlertType.warning:  AppColors.orange,
  _AlertType.advisory: AppColors.yellow,
  _AlertType.normal:   AppColors.green,
  _AlertType.info:     AppColors.accent,
};

// Shape-distinct icons, not just color — matches the set already used on
// the dashboard (see AlertLevelTypeX in models/alert_level.dart) so the
// same alert level always looks the same across screens, and so the level
// is legible even without relying on color alone.
const _typeIcons = {
  _AlertType.critical: Icons.crisis_alert_rounded,
  _AlertType.warning:  Icons.warning_amber_rounded,
  _AlertType.advisory: Icons.info_outline_rounded,
  _AlertType.normal:   Icons.check_circle_outline_rounded,
  _AlertType.info:     Icons.campaign_rounded,
};

const _typeLabels = {
  _AlertType.critical: 'CRITICAL',
  _AlertType.warning:  'WARNING',
  _AlertType.advisory: 'ADVISORY',
  _AlertType.normal:   'NORMAL',
  _AlertType.info:     'INFO',
};

// ── Screen ─────────────────────────────────────────────────────────────────────

class AlertScreen extends StatefulWidget {
  const AlertScreen({super.key});

  @override
  State<AlertScreen> createState() => _AlertScreenState();
}

class _AlertScreenState extends State<AlertScreen> {
  final List<_AlertLog> _logs = [];
  String _filter = 'ALL';
  String? _lastInjectedStatus;
  bool _loading = true;

  // Model predictions now come from the shared FloodStatusService (a
  // single app-wide poller — see services/flood_status_service.dart)
  // instead of this screen running its own independent 30-second Timer
  // against a URL that, before this change, had drifted to a hardcoded
  // address different from every other screen's.
  FloodStatusService? _statusService;

  // Supabase realtime channel
  RealtimeChannel? _channel;

  @override
  void initState() {
    super.initState();
    _fetchAlertsFromDb();
    final svc = context.read<FloodStatusService>();
    _statusService = svc;
    svc.addListener(_onStatusUpdate);
    _onStatusUpdate(); // apply whatever the service already has
    _subscribeRealtime();
  }

  @override
  void dispose() {
    _statusService?.removeListener(_onStatusUpdate);
    _channel?.unsubscribe();
    super.dispose();
  }

  // ── Data fetching ────────────────────────────────────────────────────────────

  Future<void> _fetchAlertsFromDb() async {
    try {
      final res = await Supabase.instance.client
          .from('alerts')
          .select('id, type, message, sent_by, created_at')
          .order('created_at', ascending: false)
          .limit(50);

      if (!mounted) return;

      final rows = (res as List).cast<Map<String, dynamic>>();
      final dbLogs = rows.map((row) {
        final createdAt = DateTime.tryParse(row['created_at'] as String? ?? '') ?? DateTime.now();
        final timeStr = _formatTime(createdAt);
        return _AlertLog(
          id:      row['id'] as int? ?? DateTime.now().millisecondsSinceEpoch,
          time:    timeStr,
          type:    _typeFromKey(row['type'] as String? ?? 'INFO'),
          message: row['message'] as String? ?? '',
          sentBy:  row['sent_by'] as String? ?? 'System',
          read:    true, // treat DB records as already read
        );
      }).toList();

      setState(() {
        _logs.addAll(dbLogs);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  void _onStatusUpdate() {
    final svc = _statusService;
    if (svc == null || !mounted) return;
    final body = svc.rawJson;
    if (body == null) return;
    _injectFromJson(body);
  }

  void _injectFromJson(Map<String, dynamic> body) {
    final alertKey  = body['alert_level'] as String? ?? 'NORMAL';
    final status    = body['status'] as String? ?? '';
    final prob      = ((body['probability'] as num?)?.toDouble() ?? 0) * 100;
    final metrics   = body['live_metrics'] as Map<String, dynamic>? ?? {};
    final rainfall  = (metrics['rainfall_mm'] as num?)?.toDouble() ?? 0.0;
    final signal    = (metrics['wind_signal'] as num?)?.toInt() ?? 0;

    // Only inject a new log entry when alert changes (skip NORMAL to reduce noise)
    if (alertKey == 'NORMAL') return;
    if (_lastInjectedStatus == status) return;
    _lastInjectedStatus = status;

    final newLog = _AlertLog(
      id:      DateTime.now().millisecondsSinceEpoch,
      time:    _formatTime(DateTime.now()),
      type:    _typeFromKey(alertKey),
      message: '[AI Model] $status — Flood probability: ${prob.toStringAsFixed(1)}%. '
               'Rainfall: ${rainfall.toStringAsFixed(1)}mm, Signal #$signal.',
      sentBy:  'LSTM Model (Auto)',
      read:    false,
    );

    if (mounted) setState(() => _logs.insert(0, newLog));
  }

  void _subscribeRealtime() {
    _channel = Supabase.instance.client
        .channel('alerts_realtime')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'alerts',
          callback: (payload) {
            final row = payload.newRecord;
            final createdAt = DateTime.tryParse(row['created_at'] as String? ?? '') ?? DateTime.now();
            final newLog = _AlertLog(
              id:      row['id'] as int? ?? DateTime.now().millisecondsSinceEpoch,
              time:    _formatTime(createdAt),
              type:    _typeFromKey(row['type'] as String? ?? 'INFO'),
              message: row['message'] as String? ?? '',
              sentBy:  row['sent_by'] as String? ?? 'System',
              read:    false,
            );
            if (mounted) setState(() => _logs.insert(0, newLog));
          },
        )
        .subscribe();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  String _formatTime(DateTime dt) =>
      dt.toLocal().toLocaleString('en-PH',
        hour: 'numeric', minute: '2-digit', hour12: true);

  List<_AlertLog> get _filtered =>
      _filter == 'ALL'
          ? _logs
          : _logs.where((l) => _typeLabels[l.type] == _filter).toList();

  int get _unreadCount => _logs.where((l) => !l.read).length;

  void _markAllRead() => setState(() {
    for (final l in _logs) {
      l.read = true;
    }
  });

  Future<void> _confirmClearAll() async {
    if (_logs.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.bgMid,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        title: const Text(
          'Clear all alerts?',
          style: TextStyle(color: AppColors.textPri, fontWeight: FontWeight.w700, decoration: TextDecoration.none),
        ),
        content: const Text(
          'This removes every alert from this list. It only clears your local view — records already saved in the database are not deleted.',
          style: TextStyle(color: AppColors.textMuted, fontSize: 13, height: 1.4, decoration: TextDecoration.none),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel', style: TextStyle(color: AppColors.textMuted, decoration: TextDecoration.none)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Clear all', style: TextStyle(color: AppColors.red, fontWeight: FontWeight.w700, decoration: TextDecoration.none)),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      setState(() {
        _logs.clear();
        _lastInjectedStatus = null;
      });
    }
  }

  // ── Build ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final filtered = _filtered;

    return Column(
      children: [

        // ── Header bar ────────────────────────────────────────
        SafeArea(
          bottom: false,
          child: Container(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.accent.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.notifications_rounded, color: AppColors.accent, size: 15),
              ),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'Notifications',
                  style: TextStyle(
                    color: AppColors.textPri,
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    decoration: TextDecoration.none,
                  ),
                ),
              ),
              if (_unreadCount > 0) ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.accent.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.accent.withOpacity(0.3)),
                  ),
                  child: Text(
                    '$_unreadCount unread',
                    style: const TextStyle(
                      color: AppColors.accent,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      decoration: TextDecoration.none,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
              ],
              if (_unreadCount > 0)
                GestureDetector(
                  onTap: _markAllRead,
                  child: const Text(
                    'Mark all read',
                    style: TextStyle(
                      color: AppColors.accent,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      decoration: TextDecoration.none,
                    ),
                  ),
                ),
              if (_logs.isNotEmpty) ...[
                const SizedBox(width: 12),
                GestureDetector(
                  onTap: _confirmClearAll,
                  child: const Text(
                    'Clear all',
                    style: TextStyle(
                      color: AppColors.red,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      decoration: TextDecoration.none,
                    ),
                  ),
                ),
              ],
            ],
          ),
          ),
        ),

        // ── Filter chips ──────────────────────────────────────
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          color: AppColors.bgDark,
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: ['ALL', 'CRITICAL', 'WARNING', 'ADVISORY', 'INFO', 'NORMAL']
                  .map((f) => _FilterChip(
                        label: f,
                        active: _filter == f,
                        onTap: () => setState(() => _filter = f),
                      ))
                  .toList(),
            ),
          ),
        ),

        // ── Log list ──────────────────────────────────────────
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: AppColors.accent))
              : filtered.isEmpty
                  ? _EmptyState(filter: _filter)
                  : RefreshIndicator(
                      onRefresh: _fetchAlertsFromDb,
                      color: AppColors.accent,
                      backgroundColor: AppColors.bgMid,
                      child: ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: filtered.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (_, i) => _AlertCard(
                          log: filtered[i],
                          onTap: () => setState(() => filtered[i].read = true),
                        ),
                      ),
                    ),
        ),
      ],
    );
  }
}

// ── Widgets ────────────────────────────────────────────────────────────────────

class _FilterChip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _FilterChip({required this.label, required this.active, required this.onTap});

  Color get _color {
    switch (label) {
      case 'CRITICAL': return AppColors.red;
      case 'WARNING':  return AppColors.orange;
      case 'ADVISORY': return AppColors.yellow;
      case 'NORMAL':   return AppColors.green;
      case 'INFO':     return AppColors.accent;
      default:         return AppColors.accent;
    }
  }

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      margin: const EdgeInsets.only(right: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: active ? _color.withOpacity(0.15) : AppColors.bgMid,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: active ? _color.withOpacity(0.5) : AppColors.bgBorder),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: active ? _color : AppColors.textMuted,
          fontSize: 11,
          fontWeight: active ? FontWeight.w700 : FontWeight.w400,
          decoration: TextDecoration.none,
        ),
      ),
    ),
  );
}

class _AlertCard extends StatelessWidget {
  final _AlertLog log;
  final VoidCallback onTap;
  const _AlertCard({required this.log, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final color = _typeColors[log.type] ?? AppColors.accent;
    final icon  = _typeIcons[log.type]  ?? Icons.campaign_rounded;
    final label = _typeLabels[log.type] ?? 'INFO';

    return GestureDetector(
      onTap: onTap,
      child: Opacity(
        opacity: log.read ? 0.75 : 1.0,
        // ✅ FIX: Wrap with ClipRRect to provide borderRadius while keeping non‑uniform border
        child: ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: log.read ? AppColors.bgCard : color.withOpacity(0.07),
              // borderRadius removed – now handled by ClipRRect
              border: Border(
                left: BorderSide(color: color, width: 3),
                top:    BorderSide(color: log.read ? AppColors.bgBorder : color.withOpacity(0.25)),
                right:  BorderSide(color: log.read ? AppColors.bgBorder : color.withOpacity(0.25)),
                bottom: BorderSide(color: log.read ? AppColors.bgBorder : color.withOpacity(0.25)),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Icon(icon, color: color, size: 15),
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(
                      color: color.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      label,
                      style: TextStyle(
                        color: color,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                        decoration: TextDecoration.none,
                      ),
                    ),
                  ),
                  const Spacer(),
                  if (!log.read)
                    Container(
                      width: 7, height: 7,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: color),
                    ),
                  const SizedBox(width: 6),
                  Text(
                    log.time,
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 11, decoration: TextDecoration.none),
                  ),
                ]),
                const SizedBox(height: 8),
                Text(
                  log.message,
                  style: const TextStyle(
                    color: AppColors.textPri,
                    fontSize: 13,
                    height: 1.45,
                    decoration: TextDecoration.none,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Sent by: ${log.sentBy}',
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 11, decoration: TextDecoration.none),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final String filter;
  const _EmptyState({required this.filter});

  @override
  Widget build(BuildContext context) => Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text('🔔', style: TextStyle(fontSize: 40, color: AppColors.textMuted, decoration: TextDecoration.none)),
        const SizedBox(height: 12),
        Text(
          filter == 'ALL' ? 'No alerts yet' : 'No $filter alerts',
          style: const TextStyle(
            color: AppColors.textPri,
            fontWeight: FontWeight.w700,
            fontSize: 15,
            decoration: TextDecoration.none,
          ),
        ),
        const SizedBox(height: 4),
        const Text(
          'You\'ll be notified when the system\ndetects a change in flood risk.',
          style: TextStyle(color: AppColors.textMuted, fontSize: 12, height: 1.5, decoration: TextDecoration.none),
          textAlign: TextAlign.center,
        ),
      ],
    ),
  );
}

// ── Locale helper (replaces JS toLocaleString) ─────────────────────────────────

extension _DateFormat on DateTime {
  String toLocaleString(String locale, {String hour = 'numeric', String minute = '2-digit', bool hour12 = true}) {
    final local = toLocal();
    final h = local.hour % 12 == 0 ? 12 : local.hour % 12;
    final m = local.minute.toString().padLeft(2, '0');
    final period = local.hour < 12 ? 'AM' : 'PM';
    return '$h:$m $period';
  }
}