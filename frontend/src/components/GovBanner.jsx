import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuInfo, LuChevronDown, LuLandmark, LuPhoneCall } from 'react-icons/lu';
import { useLanguage } from '../hooks/useLanguage';

// Thin notice above the header, in the pattern used on government sites:
// one line saying what this site is, with a disclosure that explains where
// official advisories come from. Styles live in gov-theme.css.
export default function GovBanner() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <section className="gov-banner" aria-label={t('banner.label')}>
      <div className="gov-banner-bar">
        <LuInfo size={16} aria-hidden="true" />
        <p>{t('banner.line')}</p>
        <button
          type="button"
          className="gov-banner-toggle"
          aria-expanded={open}
          aria-controls="gov-banner-more"
          onClick={() => setOpen((v) => !v)}
        >
          {t('banner.toggle')}
          <LuChevronDown size={14} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div id="gov-banner-more" className="gov-banner-more">
          <div>
            <LuLandmark size={22} aria-hidden="true" />
            <section>
              <h2>{t('banner.officialTitle')}</h2>
              <p>{t('banner.officialText')}</p>
            </section>
          </div>
          <div>
            <LuPhoneCall size={22} aria-hidden="true" />
            <section>
              <h2>{t('banner.emergencyTitle')}</h2>
              <p>{t('banner.emergencyText')} <Link to="/emergency">{t('banner.emergencyLink')}</Link></p>
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
