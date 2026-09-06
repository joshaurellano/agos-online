import 'dart:io';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../main.dart';
import '../models/incident_report.dart';
import '../services/auth_service.dart';
import '../services/incident_service.dart';

const _categoryIcons = <String, IconData>{
  'Flood':              Icons.water_rounded,
  'Road Accident':      Icons.car_crash_rounded,
  'Power Outage':       Icons.power_off_rounded,
  'Medical Emergency':  Icons.medical_services_rounded,
  'Other':              Icons.report_rounded,
};

class ReportIncidentScreen extends StatefulWidget {
  // Lets a caller (e.g. the Evacuation screen's "I'm stranded here" quick
  // action) hand off a GPS fix it already has, so the resident doesn't have
  // to tap "Attach my current location" again — and so the report carries
  // real coordinates even if the device's location fix is flaky in the
  // moment. Purely optional; the normal in-form "Attach my current
  // location" flow still works exactly as before when these are null.
  final double? initialLat;
  final double? initialLng;
  final String? initialLocationLabel;
  final String? initialCategory;

  const ReportIncidentScreen({
    super.key,
    this.initialLat,
    this.initialLng,
    this.initialLocationLabel,
    this.initialCategory,
  });

  @override
  State<ReportIncidentScreen> createState() => _ReportIncidentScreenState();
}

class _ReportIncidentScreenState extends State<ReportIncidentScreen> {
  final _descriptionCtrl = TextEditingController();
  String _category = kIncidentCategories.first;
  File? _photo;

  bool _locating = false;
  String? _locationLabel;
  double? _lat;
  double? _lng;
  String? _locError;

  bool _submitting = false;
  String? _errorMsg;

  @override
  void initState() {
    super.initState();
    if (widget.initialCategory != null &&
        kIncidentCategories.contains(widget.initialCategory)) {
      _category = widget.initialCategory!;
    }
    if (widget.initialLat != null && widget.initialLng != null) {
      _lat = widget.initialLat;
      _lng = widget.initialLng;
      _locationLabel = widget.initialLocationLabel ??
          '${widget.initialLat!.toStringAsFixed(5)}, ${widget.initialLng!.toStringAsFixed(5)}';
    }
  }

  @override
  void dispose() {
    _descriptionCtrl.dispose();
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

      setState(() {
        _lat = pos.latitude;
        _lng = pos.longitude;
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
    if (_descriptionCtrl.text.trim().isEmpty) {
      setState(() => _errorMsg = 'Please describe what you saw.');
      return;
    }

    setState(() { _submitting = true; _errorMsg = null; });

    // No login screen anymore — every device has a silent Supabase
    // anonymous session (see main.dart), whose auth.uid() is what RLS on
    // incident_reports/incident-photos checks. If that bootstrap sign-in
    // failed (e.g. anonymous auth isn't enabled on the project yet),
    // there's nothing to attribute the report to, so surface that plainly
    // instead of a confusing storage/DB error.
    final anonId = Supabase.instance.client.auth.currentUser?.id;
    if (anonId == null) {
      setState(() {
        _errorMsg = "Couldn't verify this device — please check your connection and reopen the app.";
        _submitting = false;
      });
      return;
    }

    // Optional display name/role from a profile, if this device ever had
    // one (legacy accounts) — otherwise reports are attributed as an
    // anonymous resident. Either way `reported_by` is the stable anon
    // device ID above, so "My Reports" keeps working.
    final profile = context.read<AuthService>().currentUser;

    try {
      String? photoUrl;
      if (_photo != null) {
        photoUrl = await IncidentService.uploadPhoto(anonId, _photo!);
      }

      await IncidentService.submitReport(
        reportedBy:    anonId,
        reporterName:  profile?.name ?? 'Anonymous Resident',
        reporterRole:  profile?.roleDesc ?? 'Resident',
        category:      _category,
        description:   _descriptionCtrl.text.trim(),
        photoUrl:      photoUrl,
        latitude:      _lat,
        longitude:     _lng,
        locationLabel: _locationLabel,
      );

      if (!mounted) return;
      Navigator.of(context).pop(true); // true = submitted successfully
    } catch (e) {
      setState(() {
        _errorMsg = "Couldn't submit your report. Please check your connection and try again.";
        _submitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bgDeep,
      appBar: AppBar(
        backgroundColor: AppColors.bgDark,
        title: const Text('Report an Incident', style: TextStyle(color: AppColors.textPri, fontSize: 17, fontWeight: FontWeight.w700)),
        iconTheme: const IconThemeData(color: AppColors.textPri),
        elevation: 0,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
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
                child: Row(
                  children: const [
                    Icon(Icons.info_outline_rounded, color: AppColors.accent, size: 18),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Barangay officials review every report before it\'s shown to other residents.',
                        style: TextStyle(color: AppColors.textSec, fontSize: 12.5),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              _sectionLabel('What kind of incident?'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8, runSpacing: 8,
                children: kIncidentCategories.map((cat) {
                  final selected = _category == cat;
                  return GestureDetector(
                    onTap: () => setState(() => _category = cat),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                      decoration: BoxDecoration(
                        color: selected ? AppColors.accent.withValues(alpha: 0.16) : AppColors.bgCard,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: selected ? AppColors.accent : AppColors.bgBorder),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(_categoryIcons[cat] ?? Icons.report_rounded,
                              size: 15, color: selected ? AppColors.accent : AppColors.textMuted),
                          const SizedBox(width: 6),
                          Text(cat, style: TextStyle(
                            color: selected ? AppColors.accent : AppColors.textSec,
                            fontSize: 12.5, fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                          )),
                        ],
                      ),
                    ),
                  );
                }).toList(),
              ),

              const SizedBox(height: 20),
              _sectionLabel('What did you see?'),
              const SizedBox(height: 8),
              Container(
                decoration: BoxDecoration(
                  color: AppColors.bgCard,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.bgBorder),
                ),
                child: TextField(
                  controller: _descriptionCtrl,
                  maxLines: 4,
                  style: const TextStyle(color: AppColors.textPri, fontSize: 14),
                  decoration: const InputDecoration(
                    hintText: 'e.g. Baha na sa Zone 1, umaabot na sa tuhod...',
                    hintStyle: TextStyle(color: AppColors.textMuted, fontSize: 13),
                    contentPadding: EdgeInsets.all(14),
                    border: InputBorder.none,
                  ),
                ),
              ),

              const SizedBox(height: 20),
              _sectionLabel('Photo (optional, but helps)'),
              const SizedBox(height: 8),
              if (_photo != null)
                Stack(
                  children: [
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
                  ],
                )
              else
                Row(
                  children: [
                    Expanded(child: _actionButton(icon: Icons.camera_alt_rounded, label: 'Take Photo', onTap: _pickPhoto)),
                    const SizedBox(width: 10),
                    Expanded(child: _actionButton(icon: Icons.photo_library_rounded, label: 'From Gallery', onTap: _pickFromGallery)),
                  ],
                ),

              const SizedBox(height: 20),
              _sectionLabel('Location (optional, but helps)'),
              const SizedBox(height: 8),
              if (_locationLabel != null)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.green.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.green.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.check_circle_rounded, color: AppColors.green, size: 18),
                      const SizedBox(width: 8),
                      Expanded(child: Text('Pinned: $_locationLabel', style: const TextStyle(color: AppColors.textSec, fontSize: 12.5))),
                    ],
                  ),
                )
              else
                _actionButton(
                  icon: _locating ? null : Icons.my_location_rounded,
                  label: _locating ? 'Getting your location…' : 'Attach my current location',
                  onTap: _locating ? null : _attachLocation,
                ),
              if (_locError != null) ...[
                const SizedBox(height: 8),
                Text(_locError!, style: const TextStyle(color: AppColors.orange, fontSize: 12)),
              ],

              if (_errorMsg != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.red.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppColors.red.withValues(alpha: 0.3)),
                  ),
                  child: Text(_errorMsg!, style: const TextStyle(color: AppColors.red, fontSize: 12.5)),
                ),
              ],

              const SizedBox(height: 28),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.accent,
                    disabledBackgroundColor: AppColors.accent.withValues(alpha: 0.5),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: _submitting
                      ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                      : const Text('Submit Report', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
                ),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sectionLabel(String text) => Text(
        text.toUpperCase(),
        style: const TextStyle(
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
            else const SizedBox(width: 17, height: 17, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.accent)),
            const SizedBox(width: 8),
            Text(label, style: const TextStyle(color: AppColors.textSec, fontSize: 13, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
