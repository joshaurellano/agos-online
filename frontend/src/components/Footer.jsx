import { Link } from 'react-router-dom';
import pkg from '../../package.json';

// Slim page footer. Deliberately small: AGOS already has a sidebar for
// navigation, so this only carries what should be reachable from every page
// (privacy notice, the "model-based" disclaimer, data credits, version).
export default function Footer() {
  return (
    <footer className="app-footer">
      <p className="app-footer-note">
        Forecasts are model-based and can be wrong. In an emergency, follow the
        instructions of the Barangay and the city disaster risk reduction office.
      </p>
      <div className="app-footer-row">
        <span className="app-footer-brand">AGOS · Barangay Triangulo, Naga City</span>
        <nav className="app-footer-links" aria-label="Footer">
          <Link to="/privacy">Privacy notice</Link>
          <span className="app-footer-credit">Rainfall classes: PAGASA</span>
          <span className="app-footer-credit">Map data: OpenStreetMap contributors</span>
          <span className="app-footer-version">v{pkg.version}</span>
        </nav>
      </div>
    </footer>
  );
}
