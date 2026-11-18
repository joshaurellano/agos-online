// app_links.dart
//
// Public links shown in Settings. Fill these in before publishing; a row
// only appears in the app once its value is non-empty, so nothing shows a
// dead link or a placeholder.
//
// The Play Store also requires a privacy policy URL (see
// docs/PRIVACY_POLICY_DRAFT.md for a starting point that matches what this app
// actually does).

/// Public URL of your hosted privacy policy, e.g. a page on your barangay's
/// or project's website. Leave empty until it exists.
const String kPrivacyPolicyUrl = '';

/// Who is responsible for the data AGOS handles, as named in the privacy
/// notice. TODO: replace with the exact name of your barangay office /
/// project team before release.
const String kDataControllerName = 'the AGOS project team for Barangay Triangulo, Naga City';

/// Where people send privacy requests (access, correction, deletion,
/// questions). Falls back to [kFeedbackEmail] when empty. At least one of
/// the two should be filled in before release — the notice tells people they
/// can write to you.
const String kPrivacyContactEmail = '';

/// Where feedback and problem reports should go. Leave empty to hide the
/// "Send feedback" row.
const String kFeedbackEmail = '';
