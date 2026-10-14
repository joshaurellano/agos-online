import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../hooks/useLanguage';
import { isResident } from '../lib/roles';
import { LuActivity, LuRoute, LuCloudRain, LuMegaphone, LuUsers } from 'react-icons/lu';

// Sticky bottom bar shown only on narrow (phone-width) viewports -- see
// .quick-actions-bar in index.css, hidden entirely above 768px where the
// sidebar already surfaces navigation.
//
// Staff/admin get "Report" + "Resident reports" front and center, since
// /reports and /community-reports are where they actually work. Residents
// and anonymous visitors are redirected away from both of those pages by
// ResidentRoute today -- reporting for the public happens through the
// mobile app -- so this bar leads with the two things a resident can act
// on right here in the browser: the evacuation map and the current
// rainfall/status read.
export default function QuickActionsBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();
  const staffView = !!user && !isResident(user);

  const actions = staffView
    ? [
        { label: t('reportWhatYouSee'), icon: <LuMegaphone size={20} />, to: '/reports',            primary: true },
        { label: 'Resident reports',    icon: <LuUsers size={20} />, to: '/community-reports' },
        { label: t('nav.evacuationMap'),icon: <LuRoute size={20} />, to: '/evacuation-map' },
        { label: t('nav.status'),       icon: <LuActivity size={20} />, to: '/dashboard' },
      ]
    : [
        { label: t('nav.status'),          icon: <LuActivity size={20} />, to: '/dashboard',      primary: true },
        { label: t('findEvacuationRoute'), icon: <LuRoute size={20} />, to: '/evacuation-map' },
        { label: t('nav.rainfall'),        icon: <LuCloudRain size={20} />, to: '/rainfall' },
      ];

  return (
    <nav className="quick-actions-bar" aria-label="Quick actions">
      {actions.map(a => (
        <button
          key={a.to}
          type="button"
          className={(a.primary ? 'primary ' : '') + (pathname === a.to ? 'current' : '')}
          aria-current={pathname === a.to ? 'page' : undefined}
          onClick={() => navigate(a.to)}
        >
          <span className="qa-icon" aria-hidden="true">{a.icon}</span>
          {a.label}
        </button>
      ))}
    </nav>
  );
}
