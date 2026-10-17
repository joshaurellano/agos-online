import { Link } from 'react-router-dom';
import { LuMapPin, LuChevronRight } from 'react-icons/lu';
import pkg from '../../package.json';
import agosLogo from '../assets/agos-logo.png';

// Four-column page footer (brand, contact, about, links), shown under every
// page inside the main layout. It stays a deep navy band in every theme, like
// the sidebar, so it reads as a clear end of the page. Styles live here so the
// footer is one file.
const STYLES = `
.site-footer {
  --f-text: #eef5ff;
  --f-soft: #c3d6ee;
  --f-accent: #5ec8fa;
  --f-line: rgba(255, 255, 255, 0.16);
  position: relative; margin-top: 24px; padding: 40px 24px 18px;
  background: linear-gradient(180deg, #123a66 0%, #0c2a4d 100%);
  color: var(--f-soft); font-size: 0.92rem; line-height: 1.65;
}
.site-footer::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
  background: linear-gradient(90deg, #0369a1, #5ec8fa, #0369a1);
}
.site-footer-inner { max-width: 1200px; margin: 0 auto; }

.site-footer-grid { display: grid; gap: 32px 44px; grid-template-columns: 1.35fr 1fr 1.35fr 0.9fr; }

.site-footer-brand { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }
.site-footer-logo { width: 52px; height: 52px; border-radius: 12px; flex-shrink: 0; }
.site-footer-name { color: var(--f-text); font-size: 0.95rem; line-height: 1.35; }
.site-footer-name strong { display: block; font-family: var(--font-display); font-size: 1.3rem; font-weight: 800; letter-spacing: .05em; }

.site-footer-heading {
  margin: 0 0 14px; padding-bottom: 8px; position: relative;
  font-family: var(--font-display); font-size: 0.8rem; font-weight: 800;
  letter-spacing: .1em; text-transform: uppercase; color: var(--f-text);
}
.site-footer-heading::after {
  content: ''; position: absolute; left: 0; bottom: 0; width: 28px; height: 2px;
  border-radius: 2px; background: var(--f-accent);
}
.site-footer-block + .site-footer-block { margin-top: 22px; }
.site-footer p { margin: 0; }

.site-footer-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.site-footer-chip {
  padding: 3px 11px; border-radius: 999px; font-size: 0.8rem; font-weight: 600;
  color: var(--f-text); background: rgba(255, 255, 255, 0.1); border: 1px solid var(--f-line);
}

.site-footer-contact { display: flex; align-items: flex-start; gap: 12px; color: var(--f-text); }
.site-footer-contact-icon {
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 36px; height: 36px; border-radius: 50%; font-size: 1.1rem;
  color: var(--f-accent); background: rgba(94, 200, 250, 0.14); border: 1px solid rgba(94, 200, 250, 0.4);
}

.site-footer-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.site-footer-link {
  display: inline-flex; align-items: center; gap: 4px; padding: 4px 0;
  color: var(--f-text); text-decoration: none; font-weight: 600;
}
.site-footer-link svg { color: var(--f-accent); transition: transform 0.15s ease; }
.site-footer-link:hover { color: var(--f-accent); }
.site-footer-link:hover svg { transform: translateX(3px); }
.site-footer-link:focus-visible { outline: 2px solid var(--f-accent); outline-offset: 3px; border-radius: 4px; }

.site-footer-bottom {
  margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--f-line);
  display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 16px;
  font-size: 0.82rem; color: var(--f-soft);
}

@media (prefers-reduced-motion: reduce) { .site-footer-link svg { transition: none; } }
@media (max-width: 1000px) { .site-footer-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 600px) {
  .site-footer { padding: 30px 16px 16px; }
  .site-footer-grid { grid-template-columns: 1fr; gap: 28px; }
}
`;

export default function Footer() {
  return (
    <footer className="site-footer">
      <style>{STYLES}</style>
      <div className="site-footer-inner">
        <div className="site-footer-grid">
          <div>
            <div className="site-footer-brand">
              <img src={agosLogo} alt="" className="site-footer-logo" />
              <span className="site-footer-name">
                <strong>AGOS</strong>
                Flood Early Warning System
              </span>
            </div>
            <div className="site-footer-block">
              <h2 className="site-footer-heading">Project of</h2>
              <p>Students of Naga College Foundation, College of Computer Studies</p>
            </div>
            <div className="site-footer-block">
              <h2 className="site-footer-heading">Data from</h2>
              <div className="site-footer-chips">
                <span className="site-footer-chip">PAGASA</span>
                <span className="site-footer-chip">Open-Meteo</span>
                <span className="site-footer-chip">OpenStreetMap</span>
              </div>
            </div>
          </div>

          <div>
            <h2 className="site-footer-heading">Contact us</h2>
            <div className="site-footer-contact">
              <span className="site-footer-contact-icon" aria-hidden="true"><LuMapPin /></span>
              <p>Visit the Barangay Triangulo office, Naga City.</p>
            </div>
          </div>

          <div>
            <h2 className="site-footer-heading">About</h2>
            <p>
              AGOS gives Barangay Triangulo flood forecasts and early warnings. Forecasts are
              model-based and can be wrong. In an emergency, follow the Barangay and the city
              disaster risk reduction office.
            </p>
          </div>

          <div>
            <h2 className="site-footer-heading">Links</h2>
            <ul className="site-footer-list">
              <li><Link className="site-footer-link" to="/know-your-hazards">Know your risk <LuChevronRight aria-hidden="true" /></Link></li>
              <li><Link className="site-footer-link" to="/rainfall">Rainfall <LuChevronRight aria-hidden="true" /></Link></li>
              <li><Link className="site-footer-link" to="/privacy">Privacy notice <LuChevronRight aria-hidden="true" /></Link></li>
            </ul>
          </div>
        </div>

        <div className="site-footer-bottom">
          <span>© {new Date().getFullYear()} AGOS · Barangay Triangulo, Naga City</span>
          <span>v{pkg.version}</span>
        </div>
      </div>
    </footer>
  );
}