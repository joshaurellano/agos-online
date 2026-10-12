import { Link } from 'react-router-dom';

// ─────────────────────────────────────────────────────────────────────────
// EDIT THESE before launch. Anything still in [square brackets] is a
// placeholder that the barangay / school data protection officer must fill
// in. Set IS_DRAFT to false once the notice has been reviewed.
// ─────────────────────────────────────────────────────────────────────────
const IS_DRAFT = true;
const LAST_UPDATED = 'October 12, 2026';
const CONTROLLER = '[Barangay Triangulo, Naga City — confirm legal name]';
const DPO_NAME = '[Data Protection Officer name]';
const DPO_EMAIL = '[dpo email address]';
const DPO_PHONE = '[contact number]';
const RETENTION_RESIDENTS = '[how long, e.g. until the resident asks to be removed]';
const RETENTION_REPORTS = '[how long resident reports and photos are kept]';

const DATA_ROWS = [
  {
    who: 'Residents on the alert list',
    what: 'Full name, mobile number, the mobile network we detect from the number, a record that you agreed to receive alerts, and which staff member registered you.',
    why: 'To send you flood alerts by SMS.',
  },
  {
    who: 'Barangay staff and administrators',
    what: 'Full name, mobile number, username, role, and a sign-in record.',
    why: 'To let authorized people sign in and use AGOS.',
  },
  {
    who: 'People who send a flood report',
    what: 'Your name, a description, an optional photo, and the location you pin on the map.',
    why: 'So staff can check the report and show verified reports on the flood map.',
  },
  {
    who: 'Anyone using the website',
    what: 'Basic page-view statistics from our hosting provider. Your device location is used only if you allow it, and only inside your browser to find the nearest evacuation center. It is not sent to us.',
    why: 'To keep the website working and to give you directions.',
  },
];

function Section({ id, title, children }) {
  return (
    <section className="privacy-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="privacy-page fade-in">
      <h1 className="privacy-title">Privacy notice</h1>
      <p className="privacy-meta">Last updated {LAST_UPDATED}</p>

      {IS_DRAFT && (
        <div className="privacy-draft" role="note">
          <strong>Draft.</strong> This notice has not yet been reviewed by the data protection officer.
          Items in [square brackets] still need to be filled in.
        </div>
      )}

      <Section id="p-who" title="Who we are">
        <p>
          AGOS is the flood early warning system of {CONTROLLER}. We collect and use the
          personal information described below under the Data Privacy Act of 2012 (Republic Act No. 10173).
        </p>
      </Section>

      <Section id="p-what" title="What we collect and why">
        <div className="privacy-table-wrap">
          <table className="privacy-table">
            <thead>
              <tr><th scope="col">Who</th><th scope="col">What we keep</th><th scope="col">Why</th></tr>
            </thead>
            <tbody>
              {DATA_ROWS.map(r => (
                <tr key={r.who}>
                  <th scope="row">{r.who}</th>
                  <td data-label="What we keep">{r.what}</td>
                  <td data-label="Why">{r.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>We only use this information for flood monitoring, alerts and response. We do not sell it or use it for advertising.</p>
      </Section>

      <Section id="p-consent" title="Your consent">
        <p>
          Residents are added to the alert list in person, after they have been identified and have agreed to receive
          SMS alerts and to have their number stored. You can withdraw that consent at any time by contacting the
          person named below, and your number will be removed from the list.
        </p>
      </Section>

      <Section id="p-share" title="Who can see it">
        <ul>
          <li>Barangay staff and administrators who need it to do their work.</li>
          <li>Our SMS provider, which receives your number and the alert text so it can deliver the message.</li>
          <li>Our hosting and database providers, who store the data for us.</li>
          <li>Verified flood reports, including the pinned location, appear on the flood map.</li>
        </ul>
        <p>We share information with others only when the law requires it.</p>
      </Section>

      <Section id="p-keep" title="How long we keep it">
        <ul>
          <li>Alert-list entries: {RETENTION_RESIDENTS}</li>
          <li>Flood reports and photos: {RETENTION_REPORTS}</li>
        </ul>
        <p>Changes to the resident list are recorded in an audit log so we can see who changed what.</p>
      </Section>

      <Section id="p-rights" title="Your rights">
        <p>Under the Data Privacy Act you have the right to:</p>
        <ul>
          <li>be informed about how your data is used;</li>
          <li>see the data we hold about you;</li>
          <li>correct data that is wrong;</li>
          <li>object to its use, or ask us to block or delete it;</li>
          <li>claim damages if your data was misused.</li>
        </ul>
        <p>
          You can also complain to the National Privacy Commission.
        </p>
      </Section>

      <Section id="contact" title="Contact">
        <p>To ask a question, correct your details, or be removed from the alert list, contact our data protection officer:</p>
        <p className="privacy-contact">
          {DPO_NAME}<br />
          {DPO_EMAIL}<br />
          {DPO_PHONE}
        </p>
        <p>
          If a data breach affects you, we will tell you and the National Privacy Commission within 72 hours of finding out,
          as the law requires.
        </p>
      </Section>

      <Section id="p-changes" title="Changes to this notice">
        <p>If we change this notice, the date at the top will change.</p>
      </Section>

      <p><Link to="/dashboard">← Back to dashboard</Link></p>
    </div>
  );
}
