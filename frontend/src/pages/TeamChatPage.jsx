import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LuMessageSquare, LuSend, LuLink, LuX, LuUsers, LuRadio,
} from 'react-icons/lu';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabaseClient';
import { ErrorBanner, Badge } from '../components/ui';
import { RESIDENT_ROLE_ID } from '../lib/roles';
import { reportTimeAgo as timeAgo } from '../lib/incidentReports';
import {
  RESPONDER_STATUSES, RESPONDER_STATUS_COLORS, RESPONDER_STATUS_LABELS,
  DEFAULT_RESPONDER_STATUS, incidentShortLabel,
} from '../lib/teamChat';
import { logger } from '../lib/logger';

// ─── Coordination channel for BDRRM staff/response teams ───────────────────
//
// Deliberately separate from the resident-facing alert system
// (AlertsLogPage.jsx / AlertDeliveryStatus.jsx): those push messages OUT to
// the public, this is staff talking to EACH OTHER during an event. Two
// backend tables support it (see the migration handed off alongside this
// file, since this repo only holds the frontend):
//
//   team_messages     id, sender_id -> profiles.id, message, created_at,
//                      incident_report_id -> incident_reports.id (nullable)
//   responder_status  user_id -> profiles.id (PK), status, updated_at
//
// Both are RLS-restricted to authenticated, non-resident accounts, the same
// boundary this page's route uses (see ResidentRoute in App.jsx -- the name
// is a holdover from when it only gated resident-submission pages, but it
// already means "not a resident account" everywhere it's used).

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function Avatar({ name, size = 34, online = null }) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: 'rgba(56,189,248,0.16)', color: 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.38, fontWeight: 800, fontFamily: 'var(--font-display)',
      }}>
        {initials(name)}
      </div>
      {online !== null && (
        <span
          title={online ? 'Online now' : 'Offline'}
          style={{
            position: 'absolute', bottom: -1, right: -1,
            width: size * 0.32, height: size * 0.32, borderRadius: '50%',
            background: online ? '#22c55e' : 'var(--text-muted)',
            border: '2px solid var(--blue-card)',
          }}
        />
      )}
    </div>
  );
}

function StatusChip({ status }) {
  const color = RESPONDER_STATUS_COLORS[status] ?? RESPONDER_STATUS_COLORS[DEFAULT_RESPONDER_STATUS];
  const label = RESPONDER_STATUS_LABELS[status] ?? RESPONDER_STATUS_LABELS[DEFAULT_RESPONDER_STATUS];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color, fontWeight: 700 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} aria-hidden="true" />
      {label}
    </span>
  );
}

// ─── Status board ───────────────────────────────────────────────────────────

function StatusBoard({ team, currentUserId, onlineIds, onSetStatus, savingStatus }) {
  const onlineCount = team.filter(m => onlineIds.has(m.id)).length;
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LuUsers size={15} aria-hidden="true" /> Team Status
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: '#22c55e', textTransform: 'none', letterSpacing: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} aria-hidden="true" />
          {onlineCount} online
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', flex: 1 }}>
        {team.length === 0 && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '8px 2px' }}>
            No other staff accounts found yet.
          </div>
        )}
        {team.map((member) => {
          const isSelf = member.id === currentUserId;
          return (
            <div
              key={member.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 6px',
                borderBottom: '1px solid var(--blue-border)',
              }}
            >
              <Avatar name={member.name} size={30} online={isSelf ? true : onlineIds.has(member.id)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {member.name}{isSelf && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> (you)</span>}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{member.role_desc}</div>
              </div>
              <StatusChip status={member.status} />
            </div>
          );
        })}
      </div>

      {/* Self status control, always pinned below the list */}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--blue-border)' }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
          Set your status
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {RESPONDER_STATUSES.map((s) => {
            const mine = team.find(m => m.id === currentUserId)?.status ?? DEFAULT_RESPONDER_STATUS;
            const active = mine === s.key;
            return (
              <button
                key={s.key}
                type="button"
                disabled={savingStatus}
                onClick={() => onSetStatus(s.key)}
                className="btn"
                style={{
                  padding: '6px 12px', fontSize: '0.72rem',
                  background: active ? `${s.color}22` : 'transparent',
                  border: `1px solid ${active ? s.color : 'var(--blue-border)'}`,
                  color: active ? s.color : 'var(--text-secondary)',
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Chat feed + composer ───────────────────────────────────────────────────

function MessageRow({ msg, isOwn }) {
  const navigate = useNavigate();
  return (
    <div style={{
      display: 'flex', gap: 8, padding: '6px 2px',
      flexDirection: isOwn ? 'row-reverse' : 'row',
    }}>
      <Avatar name={msg.sender?.name} size={30} />
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: isOwn ? 'flex-end' : 'flex-start',
        maxWidth: '72%',
      }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
          flexDirection: isOwn ? 'row-reverse' : 'row',
        }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {isOwn ? 'You' : msg.sender?.name ?? 'Unknown'}
          </span>
          {!isOwn && msg.sender?.role_desc && <Badge size="sm" color="var(--text-muted)">{msg.sender.role_desc}</Badge>}
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{timeAgo(msg.created_at)}</span>
        </div>

        <div style={{
          fontSize: '0.86rem', marginTop: 3, wordBreak: 'break-word',
          padding: '8px 12px', borderRadius: 14,
          borderTopRightRadius: isOwn ? 4 : 14,
          borderTopLeftRadius: isOwn ? 14 : 4,
          background: isOwn ? 'var(--accent2)' : 'var(--blue-mid)',
          color: isOwn ? '#fff' : 'var(--text-secondary)',
        }}>
          {msg.message}
        </div>

        {msg.incident && (
          <button
            type="button"
            onClick={() => navigate('/community-reports', { state: { focusReportId: msg.incident.id } })}
            title="Open this report"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5,
              fontSize: '0.68rem', color: 'var(--accent)', background: 'rgba(56,189,248,0.1)',
              border: '1px solid rgba(56,189,248,0.25)', borderRadius: 6, padding: '2px 8px',
              cursor: 'pointer', font: 'inherit', textAlign: 'left',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(56,189,248,0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(56,189,248,0.1)'; }}
          >
            <LuLink size={11} aria-hidden="true" /> {incidentShortLabel(msg.incident)}
          </button>
        )}
      </div>
    </div>
  );
}

export default function TeamChatPage() {
  const { user } = useAuth();

  const [team, setTeam] = useState([]);
  const [messages, setMessages] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [draft, setDraft] = useState('');
  const [linkedIncidentId, setLinkedIncidentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [onlineIds, setOnlineIds] = useState(() => new Set());

  const feedEndRef = useRef(null);
  const incidentById = useRef(new Map());

  // ── Data loading ──────────────────────────────────────────────────────
  const fetchTeamAndStatus = useCallback(async () => {
    const [{ data: profiles, error: pErr }, { data: statuses, error: sErr }] = await Promise.all([
      supabase.from('profiles').select('id, name, roles(role_desc)').neq('role_id', RESIDENT_ROLE_ID).order('name'),
      supabase.from('responder_status').select('user_id, status'),
    ]);
    if (pErr || sErr) {
      logger.error('team status fetch error:', pErr?.message || sErr?.message);
      setErrorMsg('Could not load the team status board.');
      return;
    }
    const statusByUser = new Map((statuses ?? []).map(s => [s.user_id, s.status]));
    setTeam((profiles ?? []).map(p => ({
      id: p.id,
      name: p.name,
      role_desc: p.roles?.role_desc ?? 'Staff',
      status: statusByUser.get(p.id) ?? DEFAULT_RESPONDER_STATUS,
    })));
  }, []);

  const fetchIncidents = useCallback(async () => {
    const { data, error } = await supabase
      .from('incident_reports')
      .select('id, description, location_label, status, created_at')
      .neq('status', 'rejected')
      .order('created_at', { ascending: false })
      .limit(20);
    if (!error) {
      setIncidents(data ?? []);
      incidentById.current = new Map((data ?? []).map(r => [r.id, r]));
    }
  }, []);

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('team_messages')
      .select('id, message, created_at, incident_report_id, sender:profiles(id, name, roles(role_desc))')
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) {
      logger.error('team_messages fetch error:', error.message);
      setErrorMsg('Could not load team messages.');
      return;
    }
    setMessages((data ?? []).map(m => ({
      ...m,
      sender: m.sender ? { id: m.sender.id, name: m.sender.name, role_desc: m.sender.roles?.role_desc } : null,
      incident: m.incident_report_id ? incidentById.current.get(m.incident_report_id) : null,
    })));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchTeamAndStatus(), fetchIncidents()]);
      await fetchMessages();
      setLoading(false);
    })();
  }, [fetchTeamAndStatus, fetchIncidents, fetchMessages]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // ── Realtime: new messages and status changes appear without a refresh ──
  useEffect(() => {
    const channel = supabase
      .channel('team_chat_messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'team_messages' }, () => {
        fetchMessages();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchMessages]);

  useEffect(() => {
    const channel = supabase
      .channel('team_chat_status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'responder_status' }, () => {
        fetchTeamAndStatus();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTeamAndStatus]);

  // "Online now" -- who currently has this page open, distinct from the
  // manually-set on_duty/deployed/off_duty status above. Uses Supabase's
  // Presence feature (a channel roster kept in memory by Supabase, not a
  // database table) rather than responder_status, since presence should
  // clear itself the instant a tab closes -- a duty status shouldn't.
  useEffect(() => {
    if (!user?.id) return undefined;
    const channel = supabase.channel('team_chat_presence', {
      config: { presence: { key: user.id } },
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        setOnlineIds(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // ── Actions ──────────────────────────────────────────────────────────
  const handleSend = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const { error } = await supabase.from('team_messages').insert({
      sender_id: user.id,
      message: text,
      incident_report_id: linkedIncidentId || null,
    });
    if (error) {
      logger.error('team_messages insert error:', error.message);
      setErrorMsg('Message could not be sent. Check your connection and try again.');
    } else {
      setDraft('');
      setLinkedIncidentId('');
      fetchMessages();
    }
    setSending(false);
  };

  const handleSetStatus = async (status) => {
    setSavingStatus(true);
    const { error } = await supabase.from('responder_status').upsert({
      user_id: user.id,
      status,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      logger.error('responder_status upsert error:', error.message);
      setErrorMsg('Could not update your status.');
    } else {
      fetchTeamAndStatus();
    }
    setSavingStatus(false);
  };

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading team channel…</div>;
  }

  return (
    <div className="fade-in">
      {errorMsg && <ErrorBanner>{errorMsg}</ErrorBanner>}

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: 'rgba(56,189,248,0.14)', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <LuRadio size={19} aria-hidden="true" />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Team Coordination
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Internal channel for BDRRM staff and response teams. Not visible to residents.
          </div>
        </div>
      </div>

      <div className="team-chat-grid">
        {/* Chat panel */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 560, padding: 0, overflow: 'hidden' }}>
          <div className="card-title" style={{ margin: 0, borderRadius: 0 }}>
            <LuMessageSquare size={15} aria-hidden="true" /> Team Channel
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px' }}>
            {messages.length === 0 && (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '16px 4px' }}>
                No messages yet. Post an update to get the channel started.
              </div>
            )}
            {messages.map(m => <MessageRow key={m.id} msg={m} isOwn={m.sender?.id === user?.id} />)}
            <div ref={feedEndRef} />
          </div>

          <form onSubmit={handleSend} style={{ borderTop: '1px solid var(--blue-border)', padding: 12 }}>
            {linkedIncidentId && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8,
                fontSize: '0.7rem', color: 'var(--accent)', background: 'rgba(56,189,248,0.1)',
                border: '1px solid rgba(56,189,248,0.25)', borderRadius: 6, padding: '3px 8px',
              }}>
                <LuLink size={11} aria-hidden="true" />
                Linking: {incidentShortLabel(incidents.find(r => String(r.id) === String(linkedIncidentId)))}
                <button
                  type="button" onClick={() => setLinkedIncidentId('')}
                  aria-label="Remove incident link"
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex' }}
                >
                  <LuX size={12} />
                </button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Post an update to the team…"
                aria-label="Message"
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--blue-border)', background: 'var(--blue-card)',
                  color: 'var(--text-primary)', fontSize: '0.86rem',
                }}
              />
              <select
                value={linkedIncidentId}
                onChange={(e) => setLinkedIncidentId(e.target.value)}
                aria-label="Link to an incident (optional)"
                title="Link to an incident (optional)"
                style={{
                  padding: '0 8px', borderRadius: 'var(--radius-sm)', maxWidth: 140,
                  border: '1px solid var(--blue-border)', background: 'var(--blue-card)',
                  color: 'var(--text-secondary)', fontSize: '0.78rem',
                }}
              >
                <option value="">No incident</option>
                {incidents.map(r => (
                  <option key={r.id} value={r.id}>{incidentShortLabel(r)}</option>
                ))}
              </select>
              <button type="submit" className="btn btn-primary" disabled={sending || !draft.trim()} aria-label="Send">
                <LuSend size={15} aria-hidden="true" />
              </button>
            </div>
          </form>
        </div>

        {/* Status board */}
        <div style={{ height: 560 }}>
          <StatusBoard
            team={team}
            currentUserId={user?.id}
            onlineIds={onlineIds}
            onSetStatus={handleSetStatus}
            savingStatus={savingStatus}
          />
        </div>
      </div>
    </div>
  );
}
