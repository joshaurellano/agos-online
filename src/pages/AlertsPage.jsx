import { useState } from 'react';
import { NOTIFICATION_LOG } from '../data/mockData';
import Swal from 'sweetalert2';

const TYPE_STYLES = {
  CRITICAL: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: '🔴' },
  WARNING:  { color: '#f97316', bg: 'rgba(249,115,22,0.1)', icon: '🟠' },
  ADVISORY: { color: '#eab308', bg: 'rgba(234,179,8,0.1)', icon: '🟡' },
  NORMAL:   { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: '🟢' },
  INFO:     { color: '#38bdf8', bg: 'rgba(56,189,248,0.1)', icon: '🔵' },
};

export default function AlertsPage() {
  const [logs, setLogs] = useState(NOTIFICATION_LOG);
  const [filter, setFilter] = useState('ALL');

  const filtered = logs.filter(l => filter === 'ALL' || l.type === filter);
  const unread = logs.filter(l => !l.read).length;

  const markAllRead = () => setLogs(prev => prev.map(l => ({ ...l, read: true })));

  const sendManualAlert = () => {
    Swal.fire({
      title: '📢 Send Manual Alert',
      html: `
        <div style="text-align:left">
          <label style="display:block;font-size:0.8rem;color:#8da4be;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Alert Type</label>
          <select id="swal-type" style="width:100%;padding:10px;background:#152a4a;border:1px solid #1e3a5f;border-radius:8px;color:#e2eaf5;margin-bottom:14px;font-size:0.9rem">
            <option value="INFO">ℹ️ Information</option>
            <option value="ADVISORY">🟡 Advisory</option>
            <option value="WARNING">🟠 Warning</option>
            <option value="CRITICAL">🔴 Critical</option>
          </select>
          <label style="display:block;font-size:0.8rem;color:#8da4be;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Message</label>
          <textarea id="swal-msg" rows="3" placeholder="Enter your alert message..." style="width:100%;padding:10px;background:#152a4a;border:1px solid #1e3a5f;border-radius:8px;color:#e2eaf5;font-size:0.9rem;resize:none"></textarea>
        </div>
      `,
      showCancelButton: true,
      confirmButtonColor: '#0ea5e9',
      cancelButtonColor: '#1e3a5f',
      confirmButtonText: '📨 Send Alert',
      background: '#0d1f3c',
      color: '#e2eaf5',
      preConfirm: () => {
        const type = document.getElementById('swal-type').value;
        const msg = document.getElementById('swal-msg').value;
        if (!msg.trim()) { Swal.showValidationMessage('Please enter a message.'); return false; }
        return { type, msg };
      },
    }).then(r => {
      if (r.isConfirmed) {
        const newLog = {
          id: Date.now(),
          time: 'Just now',
          type: r.value.type,
          message: r.value.msg,
          sent_by: 'Manual (Admin)',
          read: true,
        };
        setLogs(prev => [newLog, ...prev]);
        Swal.fire({ title: '✅ Alert Sent!', icon: 'success', background: '#0d1f3c', color: '#e2eaf5', confirmButtonColor: '#0ea5e9', timer: 2000, showConfirmButton: false });
      }
    });
  };

  return (
    <div className="fade-in">
      {/* Stats */}
      <div className="grid-4" style={{ marginBottom: '20px' }}>
        {[
          { label: 'Total Alerts', value: logs.length, icon: '🔔', color: 'var(--accent)' },
          { label: 'Unread', value: unread, icon: '📬', color: unread > 0 ? 'var(--orange)' : 'var(--green)' },
          { label: 'Critical Sent', value: logs.filter(l => l.type === 'CRITICAL').length, icon: '🔴', color: 'var(--red)' },
          { label: 'This Session', value: logs.filter(l => l.time === 'Just now').length, icon: '📤', color: 'var(--text-secondary)' },
        ].map(c => (
          <div key={c.label} className="card">
            <div style={{ fontSize: '1.2rem', marginBottom: '8px' }}>{c.icon}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, marginBottom: '4px' }}>{c.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div className="card-title" style={{ margin: 0 }}>
            🔔 Notification Log
            {unread > 0 && <span className="badge" style={{ background: 'rgba(249,115,22,0.15)', color: 'var(--orange)', border: '1px solid rgba(249,115,22,0.3)', marginLeft: 8 }}>{unread} unread</span>}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['ALL', 'CRITICAL', 'WARNING', 'ADVISORY', 'INFO'].map(f => (
              <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(f)} style={{ padding: '5px 11px', fontSize: '0.72rem' }}>{f}</button>
            ))}
            <button className="btn btn-ghost" onClick={markAllRead} style={{ padding: '5px 11px', fontSize: '0.72rem' }}>✓ Mark All Read</button>
            <button className="btn btn-primary" onClick={sendManualAlert} style={{ padding: '5px 11px', fontSize: '0.72rem' }}>+ Send Alert</button>
          </div>
        </div>

        {/* Log entries */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px', fontSize: '0.9rem' }}>No alerts found.</div>
          )}
          {filtered.map(log => {
            const ts = TYPE_STYLES[log.type] || TYPE_STYLES.INFO;
            return (
              <div
                key={log.id}
                onClick={() => setLogs(prev => prev.map(l => l.id === log.id ? { ...l, read: true } : l))}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '14px',
                  padding: '14px 16px', borderRadius: 'var(--radius-sm)',
                  background: log.read ? 'var(--blue-mid)' : ts.bg,
                  border: `1px solid ${log.read ? 'var(--blue-border)' : ts.color + '40'}`,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '1px' }}>{ts.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', color: log.read ? 'var(--text-secondary)' : 'var(--text-primary)', fontWeight: log.read ? 400 : 600, lineHeight: 1.4 }}>
                    {log.message}
                  </div>
                  <div style={{ marginTop: '5px', display: 'flex', gap: '12px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    <span>🕐 {log.time}</span>
                    <span>👤 {log.sent_by}</span>
                    <span className="badge" style={{ background: `${ts.color}15`, color: ts.color, fontSize: '0.65rem', padding: '1px 7px' }}>{log.type}</span>
                  </div>
                </div>
                {!log.read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: ts.color, flexShrink: 0, marginTop: 4 }} />}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: '14px', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>📝</span> Logs are stored locally per session. In production, this would be saved to a database and exportable as a .txt file.
        </div>
      </div>
    </div>
  );
}
