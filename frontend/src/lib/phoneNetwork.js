// Heuristic detection of a PH mobile number's carrier from its 4-digit
// prefix (e.g. "0917" -> Globe/TM). This is a known-imperfect signal --
// Mobile Number Portability (MNP) lets a number keep its original prefix
// after switching networks, so this can be wrong for ported numbers. Treat
// it as a prompt to double check, never as a hard fact.
//
// Why this matters here specifically: our SMS gateway (send-alert /
// httpsms) currently has trouble routing to Smart/TNT/Sun numbers under our
// sender setup, while Globe/TM and DITO delivery is reliable. Flagging this
// at registration -- rather than silently losing the alert later -- is the
// whole point of collecting `network` on the residents table.

// Prefixes as of this reference: https://www.npc.gov.ph -- carriers do
// reassign/retire prefixes over time, so this list will drift and should be
// revisited if new prefixes start showing up as "unknown" often.
const GLOBE_TM_PREFIXES = [
  '0817',
  '0904', '0905', '0906',
  '0915', '0916', '0917',
  '0926', '0927',
  '0935', '0936',
  '0945',
  '0953', '0954', '0955', '0956', '0957', '0958', '0959',
  '0965', '0966', '0967',
  '0975', '0976', '0977', '0978', '0979',
  '0994', '0995', '0996', '0997',
];

const SMART_TNT_PREFIXES = [
  '0907', '0908', '0909',
  '0910', '0912',
  '0918', '0919',
  '0920', '0921',
  '0928', '0929',
  '0930', '0938', '0939',
  '0946', '0947', '0948', '0949',
  '0950', '0951',
  '0961', '0963', '0968', '0969',
  '0970',
  '0981', '0989',
  '0998', '0999',
];

// Sun Cellular -- fully absorbed into the Smart network years ago, so it
// shares Smart/TNT's delivery limitation for our purposes.
const SUN_PREFIXES = [
  '0922', '0923', '0924', '0925',
  '0931', '0932', '0933', '0934',
  '0940', '0941', '0942',
];

const DITO_PREFIXES = ['0895', '0896', '0897', '0898', '0991', '0992', '0993'];

export const NETWORK_INFO = {
  globe_tm:  { label: 'Globe/TM',  deliverable: true,  color: '#22c55e' },
  smart_tnt: { label: 'Smart/TNT', deliverable: false, color: '#f59e0b' },
  sun:       { label: 'Sun (Smart)', deliverable: false, color: '#f59e0b' },
  dito:      { label: 'DITO',      deliverable: true,  color: '#22c55e' },
  unknown:   { label: 'Unknown carrier', deliverable: false, color: '#8da4be' },
};

/**
 * @param {string} phone - PH mobile number, expected format 09XXXXXXXXX
 * @returns {{ network: string, deliverable: boolean }}
 */
export function detectPhoneNetwork(phone) {
  if (!/^09\d{9}$/.test(phone)) return { network: 'unknown', deliverable: false };

  const prefix = phone.slice(0, 4);
  if (GLOBE_TM_PREFIXES.includes(prefix))  return { network: 'globe_tm',  deliverable: true };
  if (SMART_TNT_PREFIXES.includes(prefix)) return { network: 'smart_tnt', deliverable: false };
  if (SUN_PREFIXES.includes(prefix))       return { network: 'sun',       deliverable: false };
  if (DITO_PREFIXES.includes(prefix))      return { network: 'dito',      deliverable: true };
  return { network: 'unknown', deliverable: false };
}