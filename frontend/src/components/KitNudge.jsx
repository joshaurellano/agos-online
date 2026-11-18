import { Link } from 'react-router-dom';
import { LuBackpack } from 'react-icons/lu';
import { useLanguage } from '../hooks/useLanguage';
import { useKit } from '../lib/survivalKit';

// One line on the Dashboard: when the alert is above Normal and the survival
// kit is not fully packed, point the reader to it. Renders nothing otherwise.
export default function KitNudge({ alertKey }) {
  const { t } = useLanguage();
  const { checked, total } = useKit();
  if (!alertKey || alertKey === 'NORMAL' || checked.length >= total) return null;
  return (
    <div className="kit-nudge" role="status">
      <LuBackpack size={18} aria-hidden="true" />
      <p>
        {t('flood.nudge').replace('{n}', checked.length).replace('{total}', total)}{' '}
        <Link to="/know-your-hazards#survival-kit">{t('flood.nudgeLink')}</Link>
      </p>
    </div>
  );
}
