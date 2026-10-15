import { LuCrosshair, LuX } from 'react-icons/lu';
import { useYourPlace } from '../hooks/useYourPlace';
import { useLanguage } from '../hooks/useLanguage';

// Floating banner shown over either map (2D or 3D) while pick mode is on.
// Plain DOM so it sits above the map without blocking taps on it.
export default function PlacePickBanner() {
  const { picking, setPicking } = useYourPlace();
  const { t } = useLanguage();
  if (!picking) return null;
  return (
    <div className="yp-pick-banner" role="status">
      <LuCrosshair size={15} aria-hidden="true" />
      <span>{t('place.pickBanner')}</span>
      <button type="button" onClick={() => setPicking(false)} aria-label={t('place.pickCancel')}>
        <LuX size={14} aria-hidden="true" /> {t('place.pickCancel')}
      </button>
    </div>
  );
}
