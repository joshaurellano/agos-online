import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="card fade-in" style={{ maxWidth: 480, margin: '48px auto', textAlign: 'center' }}>
      <h2 className="registry-dialog-title">Page not found</h2>
      <p className="settings-desc" style={{ marginBottom: 16 }}>This page does not exist.</p>
      <Link to="/dashboard" className="btn btn-primary" style={{ textDecoration: 'none' }}>Go to dashboard</Link>
    </div>
  );
}
