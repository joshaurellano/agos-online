import 'dart:io';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../main.dart';
import '../models/incident_report.dart';
import '../services/auth_service.dart';
import '../services/connectivity_service.dart';
import '../services/incident_service.dart';
import '../services/pending_reports_service.dart';

// Remembers the name a resident typed in on this device, so they don't have
// to retype it on every report — same idea as the anonymous device ID
// already used for `reported_by`, just for the friendlier display name
// shown in the community feed ("by ...").
const _savedNameKey = 'agos_reporter_name';

class ReportIncidentScreen extends StatefulWidget {
  const ReportIncidentScreen({super.key});

  @override
  State<ReportIncidentScreen> createState() => _ReportIncidentScreenState();
}

class _ReportIncidentScreenState extends State<ReportIncidentScreen> {
  final _descriptionCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  // Residents can only file flood reports now, so this is fixed rather
  // than picked from a list — kept as a field (not a literal at the call
  // site) since `IncidentService.submitReport` still takes a category.
  final String _category = kIncidentCategories.first;
  File? _photo;

  // Quick picks, stored as a leading "[Knee-deep · Not passable]" tag on the
  // description (see ReportTags) — no database change needed.
  String? _depth;
  String? _road;

  bool _locating = false;
  double? _accuracy; // metres, shown as a hint
  String? _locationLabel;
  double? _lat;
  double? _lng;
  String? _locError;

  bool _submitting = false;
  String? _errorMsg;

  @override
  void initState() {
    super.initState();
    _loadSavedName();
    _autoAttachLocation();
  }

  // If location permission was already granted, pin the position right away
  // (no prompt, no tap) — one less step for someone standing in floodwater.
  // If it wasn't granted we do nothing; the button still asks on tap.
  Future<void> _autoAttachLocation() async {
    try {
      final perm = await Geolocator.checkPermission();
      if (perm != LocationPermission.whileInUse && perm != LocationPermission.always) return;
      if (!await Geolocator.isLocationServiceEnabled()) return;
      if (!mounted) return;
      await _attachLocation();
    } catch (_) {}
  }

  Future<void> _loadSavedName() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_savedNameKey);
      if (saved != null && saved.isNotEmpty && mounted) {
        setState(() => _nameCtrl.text = saved);
      }
    } catch (_) {
      // Non-critical — the field just starts blank if this fails.
    }
  }

  Future<void> _saveName(String name) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_savedNameKey, name);
    } catch (_) {
      // Non-critical — worst case the resident retypes it next time.
    }
  }

  @override
  void dispose() {
    _descriptionCtrl.dispose();
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1600,
      imageQuality: 80,
    );
    if (picked != null) {
      setState(() => _photo = File(picked.path));
    }
  }

  Future<void> _pickFromGallery() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      imageQuality: 80,
    );
    if (picked != null) {
      setState(() => _photo = File(picked.path));
    }
  }

  Future<void> _attachLocation() async {
    setState(() { _locating = true; _locError = null; });

    try {
      LocationPermission perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        setState(() {
          _locError = 'Location permission denied. Please enable it in Settings.';
          _locating = false;
        });
        return;
      }

      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        setState(() {
          _locError = 'Location services are off. Please enable GPS.';
          _locating = false;
        });
        return;
      }

      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      if (!mounted) return;

      setState(() {
        _lat = pos.latitude;
        _lng = pos.longitude;
        _accuracy = pos.accuracy;
        _locationLabel = '${pos.latitude.toStringAsFixed(5)}, ${pos.longitude.toStringAsFixed(5)}';
        _locating = false;
      });
    } catch (e) {
      setState(() {
        _locError = "Couldn't get your location. You can still submit without it.";
        _locating = false;
      });
    }
  }

  Future<void> _submit() async {
    if (_descriptionCtrl.text.trim().isEmpty && _depth == null) {
      setState(() => _errorMsg = 'Pick how deep the water is, or describe what you saw.');
      return;
    }

    setState(() { _submitting = true; _errorMsg = null; });

    // Optional display name/role from a profile, if this device ever had
    // one (legacy accounts) — otherwise reports are attributed as an
    // anonymous resident.
    final profile = context.read<AuthService>().currentUser;
    final typedName = _nameCtrl.text.trim();
    final displayName = typedName.isNotEmpty
        ? typedName
        : (profile?.name ?? 'Resident');
    if (typedName.isNotEmpty) _saveName(typedName); // remember for next time
    final role = profile?.roleDesc ?? 'Resident';
    final description = ReportTags.build(_depth, _road, _descriptionCtrl.text.trim());
    final outbox = context.read<PendingReportsService>();

    // One id for this report, used for BOTH the direct send and (if that
    // fails) the saved copy. If a send times out after actually reaching
    // the server, the later retry hits the same id and is recognized as
    // already delivered instead of creating a duplicate.
    final reportId = newReportId();

    // Saves the report on the device; it sends itself when signal returns.
    Future<void> saveForLater() async {
      await outbox.enqueue(
        reportId: reportId,
        reporterName: displayName,
        reporterRole: role,
        category: _category,
        description: description,
        photo: _photo,
        latitude: _lat,
        longitude: _lng,
        locationLabel: _locationLabel,
      );
      if (!mounted) return;
      Navigator.of(context).pop(ReportSubmitResult.queued);
    }

    // Clearly offline: don't make the resident wait out a timeout.
    if (ConnectivityService.instance.isOffline) {
      await saveForLater();
      return;
    }

    try {
      // The silent anonymous sign-in at startup may not have happened if
      // the app was first opened offline — try again now.
      final client = Supabase.instance.client;
      if (client.auth.currentUser == null) {
        await client.auth.signInAnonymously().timeout(const Duration(seconds: 10));
      }
      final anonId = client.auth.currentUser?.id;
      if (anonId == null) {
        setState(() {
          _errorMsg = "Couldn't verify this device — please check your connection and reopen the app.";
          _submitting = false;
        });
        return;
      }

      String? photoUrl;
      if (_photo != null) {
        try {
          photoUrl = await IncidentService.uploadPhotoStrict(anonId, _photo!);
        } catch (e) {
          // No signal: keep the photo and save the whole report for later.
          // Anything else (e.g. a storage policy): send without the photo,
          // as before — the text and location are still useful.
          if (isNetworkError(e)) rethrow;
        }
      }

      await IncidentService.submitReport(
        id:            reportId,
        reportedBy:    anonId,
        reporterName:  displayName,
        reporterRole:  role,
        category:      _category,
        description:   description,
        photoUrl:      photoUrl,
        latitude:      _lat,
        longitude:     _lng,
        locationLabel: _locationLabel,
      ).timeout(const Duration(seconds: 20));

      if (!mounted) return;
      Navigator.of(context).pop(ReportSubmitResult.sent);
    } catch (e) {
      if (isNetworkError(e)) {
        await saveForLater();
        return;
      }
      if (!mounted) return;
      setState(() {
        _errorMsg = "Couldn't submit your report. Please try again.";
        _submitting = false;
      });
    }
  }

  // One tappable option tile (depth / passability).
  Widget _choice({
    required String label,
    String? hint,
    required bool selected,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
        decoration: BoxDecoration(
          color: selected ? color.withValues(alpha: 0.16) : AppColors.bgCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: selected ? color : AppColors.bgBorder, width: selected ? 1.8 : 1),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Row(children: [
            Expanded(
              child: Text(label,
                  style: TextStyle(
                      color: selected ? AppColors.ink(color) : AppColors.textPri,
                      fontSize: 13,
                      fontWeight: FontWeight.w800)),
            ),
            if (selected) Icon(Icons.check_circle_rounded, size: 16, color: AppColors.ink(color)),
          ]),
          if (hint != null) ...[
            const SizedBox(height: 2),
            Text(hint, style: TextStyle(color: AppColors.textMuted, fontSize: 10.5)),
          ],
        ]),
      ),
    );
  }

  Color _depthColor(String d) {
    switch (d) {
      case 'Ankle-deep':
        return AppColors.yellow;
      case 'Knee-deep':
        return AppColors.orange;
      default:
        return AppColors.red;
    }
  }

  static const _depthHints = {
    'Ankle-deep': 'Bukung-bukong',
    'Knee-deep': 'Tuhod',
    'Waist-deep': 'Baywang',
    'Chest-deep or higher': 'Dibdib pataas',
  };

  Color _roadColor(String r) =>
      r == 'Passable' ? AppColors.green : (r == 'High vehicles only' ? AppColors.orange : AppColors.red);

  @override
  Widget build(BuildContext context) {
    final depthTiles = kDepthOptions
        .map((d) => _choice(
              label: d,
              hint: _depthHints[d],
              selected: _depth == d,
              color: _depthColor(d),
              onTap: () => setState(() => _depth = _depth == d ? null : d),
            ))
        .toList();

    return Scaffold(
      backgroundColor: AppColors.bgDeep,
      appBar: AppBar(
        backgroundColor: AppColors.bgDark,
        title: Text('Report Flooding', style: TextStyle(color: AppColors.textPri, fontSize: 17, fontWeight: FontWeight.w700)),
        iconTheme: IconThemeData(color: AppColors.textPri),
        elevation: 0,
      ),
      // Submit stays pinned to the bottom — no scrolling to find it.
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          decoration: BoxDecoration(
            color: AppColors.bgDark,
            border: Border(top: BorderSide(color: AppColors.bgBorder)),
          ),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            if (_errorMsg != null)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.red.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.red.withValues(alpha: 0.3)),
                ),
                child: Text(_errorMsg!, style: TextStyle(color: AppColors.ink(AppColors.red), fontSize: 12.5)),
              ),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.accent,
                  disabledBackgroundColor: AppColors.accent.withValues(alpha: 0.5),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: _submitting
                    ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                    : const Text('Send report', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Colors.white)),
              ),
            ),
          ]),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.accent.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.accent.withValues(alpha: 0.25)),
                ),
                child: Row(children: [
                  Icon(Icons.info_outline_rounded, color: AppColors.accent, size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Officials check every report before neighbors see it. '
                      'No signal? It saves on your phone and sends itself later.',
                      style: TextStyle(color: AppColors.textSec, fontSize: 12.5, height: 1.35),
                    ),
                  ),
                ]),
              ),

              const SizedBox(height: 20),
              _sectionLabel('How deep is the water?'),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: depthTiles[0]),
                const SizedBox(width: 10),
                Expanded(child: depthTiles[1]),
              ]),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: depthTiles[2]),
                const SizedBox(width: 10),
                Expanded(child: depthTiles[3]),
              ]),

              const SizedBox(height: 20),
              _sectionLabel('Can vehicles pass?'),
              const SizedBox(height: 8),
              Row(children: [
                for (var i = 0; i < kRoadOptions.length; i++) ...[
                  Expanded(
                    child: _choice(
                      label: kRoadOptions[i],
                      selected: _road == kRoadOptions[i],
                      color: _roadColor(kRoadOptions[i]),
                      onTap: () => setState(() => _road = _road == kRoadOptions[i] ? null : kRoadOptions[i]),
                    ),
                  ),
                  if (i != kRoadOptions.length - 1) const SizedBox(width: 8),
                ],
              ]),

              const SizedBox(height: 20),
              _sectionLabel('Anything else? (optional)'),
              const SizedBox(height: 8),
              Container(
                decoration: BoxDecoration(
                  color: AppColors.bgCard,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.bgBorder),
                ),
                child: TextField(
                  controller: _descriptionCtrl,
                  maxLines: 3,
                  style: TextStyle(color: AppColors.textPri, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: 'e.g. Baha na sa Zone 1, tumataas pa ang tubig…',
                    hintStyle: TextStyle(color: AppColors.textMuted, fontSize: 13),
                    contentPadding: const EdgeInsets.all(14),
                    border: InputBorder.none,
                  ),
                ),
              ),

              const SizedBox(height: 20),
              _sectionLabel('Photo (helps officials verify faster)'),
              const SizedBox(height: 8),
              if (_photo != null)
                Stack(children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Image.file(_photo!, height: 160, width: double.infinity, fit: BoxFit.cover),
                  ),
                  Positioned(
                    top: 6, right: 6,
                    child: GestureDetector(
                      onTap: () => setState(() => _photo = null),
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                        child: const Icon(Icons.close_rounded, color: Colors.white, size: 16),
                      ),
                    ),
                  ),
                ])
              else
                Row(children: [
                  Expanded(child: _actionButton(icon: Icons.camera_alt_rounded, label: 'Take photo', onTap: _pickPhoto)),
                  const SizedBox(width: 10),
                  Expanded(child: _actionButton(icon: Icons.photo_library_rounded, label: 'From gallery', onTap: _pickFromGallery)),
                ]),

              const SizedBox(height: 20),
              _sectionLabel('Location'),
              const SizedBox(height: 8),
              if (_locationLabel != null)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.green.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.green.withValues(alpha: 0.3)),
                  ),
                  child: Row(children: [
                    Icon(Icons.check_circle_rounded, color: AppColors.ink(AppColors.green), size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _accuracy != null ? 'Your location is pinned (±${_accuracy!.round()} m)' : 'Your location is pinned',
                        style: TextStyle(color: AppColors.textSec, fontSize: 12.5),
                      ),
                    ),
                    TextButton(
                      onPressed: _locating ? null : _attachLocation,
                      child: const Text('Update', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                    ),
                  ]),
                )
              else
                _actionButton(
                  icon: _locating ? null : Icons.my_location_rounded,
                  label: _locating ? 'Getting your location…' : 'Attach my current location',
                  onTap: _locating ? null : _attachLocation,
                ),
              if (_locError != null) ...[
                const SizedBox(height: 8),
                Text(_locError!, style: TextStyle(color: AppColors.ink(AppColors.orange), fontSize: 12)),
              ],

              const SizedBox(height: 20),
              _sectionLabel('Your name (optional)'),
              const SizedBox(height: 8),
              Container(
                decoration: BoxDecoration(
                  color: AppColors.bgCard,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.bgBorder),
                ),
                child: TextField(
                  controller: _nameCtrl,
                  textCapitalization: TextCapitalization.words,
                  style: TextStyle(color: AppColors.textPri, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: 'e.g. Juan Dela Cruz',
                    hintStyle: TextStyle(color: AppColors.textMuted, fontSize: 13),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
                    border: InputBorder.none,
                    prefixIcon: Icon(Icons.badge_outlined, color: AppColors.textMuted, size: 19),
                  ),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Leave blank to post as "Resident". Shown next to your report in the community feed.',
                style: TextStyle(color: AppColors.textMuted, fontSize: 11, height: 1.35),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sectionLabel(String text) => Text(
        text.toUpperCase(),
        style: TextStyle(
          color: AppColors.textMuted, fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.8,
        ),
      );

  Widget _actionButton({IconData? icon, required String label, VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 13),
        decoration: BoxDecoration(
          color: AppColors.bgCard,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.bgBorder),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (icon != null) Icon(icon, size: 17, color: AppColors.accent)
            else SizedBox(width: 17, height: 17, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accent)),
            const SizedBox(width: 8),
            Text(label, style: TextStyle(color: AppColors.textSec, fontSize: 13, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
