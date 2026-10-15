import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabaseClient';

// Official PAGASA Tropical Cyclone Bulletin data, written to the
// pagasa_bulletins table by the `pagasa-bulletin` edge function. This never
// touches the flood model backend.

const POLL_MS = 5 * 60_000;           // the function itself runs every 15-30 min
const STALE_AFTER_MS = 12 * 3_600_000; // PAGASA issues at least every 6 h

export const PAGASA_BULLETIN_PAGE = 'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin';

// TCWS wording per PAGASA's published scale.
export const TCWS_INFO = {
  1: { label: 'Signal No. 1', winds: 'Strong winds (39–61 km/h)',        color: '#3b82f6' },
  2: { label: 'Signal No. 2', winds: 'Gale-force winds (62–88 km/h)',    color: '#eab308' },
  3: { label: 'Signal No. 3', winds: 'Storm-force winds (89–117 km/h)',  color: '#f97316' },
  4: { label: 'Signal No. 4', winds: 'Typhoon-force winds (118–184 km/h)', color: '#ef4444' },
  5: { label: 'Signal No. 5', winds: 'Typhoon-force winds (≥185 km/h)',  color: '#b91c1c' },
};

// Returns the most relevant active bulletin (highest Naga signal first, then
// newest), or null when PAGASA has no active cyclone.
export function usePagasaBulletin() {
  const query = useQuery({
    queryKey: ['pagasa-bulletin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pagasa_bulletins')
        .select('*')
        .eq('is_active', true)
        .order('fetched_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      if (!data?.length) return null;
      const sorted = [...data].sort(
        (a, b) => (b.naga_signal ?? 0) - (a.naga_signal ?? 0) || new Date(b.fetched_at) - new Date(a.fetched_at)
      );
      const row = sorted[0];
      const ref = new Date(row.issued_at ?? row.fetched_at).getTime();
      return { ...row, stale: Date.now() - ref > STALE_AFTER_MS, others: sorted.length - 1 };
    },
    refetchInterval: POLL_MS,
    retry: 1,
  });
  return { bulletin: query.data ?? null, isLoading: query.isLoading, isError: query.isError };
}
