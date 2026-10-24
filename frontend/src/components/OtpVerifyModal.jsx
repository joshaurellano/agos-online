import { useEffect, useRef, useState } from 'react';
import { LuSmartphone } from 'react-icons/lu';
import { OTP_LENGTH, RESEND_SECONDS, sendOtp, verifyOtp } from '../lib/otp';

// Asks for the code texted to a mobile number. Opens, sends the code, and
// calls onVerified() once the server accepts it. Native <dialog>, like the
// other registry dialogs.

const STYLES = `
.otp-input { text-align: center; letter-spacing: 0.45em; font-size: 1.5rem; font-weight: 700; font-variant-numeric: tabular-nums; padding-left: 0.45em; }
.otp-resend { margin-right: auto; }
`;

export default function OtpVerifyModal({ open, phone, onVerified, onCancel }) {
  const ref = useRef(null);
  const sentRef = useRef(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [wait, setWait] = useState(0);

  const send = async () => {
    setSending(true);
    setError('');
    const result = await sendOtp(phone);
    setSending(false);
    if (result.ok) setWait(RESEND_SECONDS);
    else setError(result.message);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      setCode('');
      setError('');
      setWait(0);
      sentRef.current = false;
    }
    if (!open && el.open) el.close();
    if (!open) sentRef.current = false;
    if (open && !sentRef.current) {
      sentRef.current = true;
      send();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async () => {
    if (code.length !== OTP_LENGTH || checking) return;
    setChecking(true);
    setError('');
    const result = await verifyOtp(phone, code);
    setChecking(false);
    if (result.ok) {
      onVerified();
    } else {
      setError(result.message);
      setCode('');
    }
  };

  const cancel = () => { if (!checking) onCancel(); };

  return (
    <dialog
      ref={ref}
      className="registry-dialog"
      aria-labelledby="otp-title"
      onCancel={(e) => { e.preventDefault(); cancel(); }}
      onClick={(e) => { if (e.target === ref.current) cancel(); }}
    >
      <style>{STYLES}</style>
      <div className="consent-head">
        <span className="consent-head-icon" aria-hidden="true"><LuSmartphone /></span>
        <h2 id="otp-title" className="registry-dialog-title">Verify mobile number</h2>
      </div>
      <p className="consent-lead">
        {sending ? 'Sending code…' : `Enter the ${OTP_LENGTH}-digit code sent to ${phone}.`}
      </p>

      <div>
        <label htmlFor="otp-code" className="registry-field-label">Code</label>
        <input
          id="otp-code"
          className="settings-input registry-field otp-input"
          value={code}
          onChange={(e) => { setError(''); setCode(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH)); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          placeholder="••••••"
          aria-invalid={!!error}
          aria-describedby="otp-msg"
          disabled={sending}
        />
        <div id="otp-msg" role="alert" className="registry-error">{error}</div>

        <div className="registry-dialog-actions">
          <button type="button" className="btn btn-ghost otp-resend" onClick={send}
            disabled={sending || checking || wait > 0}>
            {wait > 0 ? `Resend in ${wait}s` : 'Resend code'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={cancel} disabled={checking}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit}
            disabled={sending || checking || code.length !== OTP_LENGTH}>
            {checking ? 'Checking…' : 'Verify'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
