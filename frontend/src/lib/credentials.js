// Shared rules for staff logins. The same rules are enforced again in the
// create-user and manage-user edge functions -- this copy only gives
// instant feedback in the form.

export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
export const PHONE_RE = /^09\d{9}$/;

export const isValidUsername = (v) => USERNAME_RE.test(v);
export const isValidPhone = (v) => PHONE_RE.test(v);

export function checkPassword(pw) {
  const letters = /[A-Za-z]/.test(pw);
  const digits = /\d/.test(pw);
  const ok = pw.length >= 8 && letters && digits;
  let score = 0;
  if (pw.length >= 8) score++;
  if (letters && digits) score++;
  if (pw.length >= 12) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const label = score <= 1 ? 'Weak' : score === 2 ? 'Fair' : score === 3 ? 'Good' : 'Strong';
  return { ok, label };
}

// Uniform random integer in [0, n) from crypto (rejection sampling, no bias).
function randInt(n) {
  const buf = new Uint32Array(1);
  const max = Math.floor(0x100000000 / n) * n;
  do { crypto.getRandomValues(buf); } while (buf[0] >= max);
  return buf[0] % n;
}

// 12 chars from an unambiguous alphabet (no 0/O, 1/l/I), always with a
// letter and a digit so it passes checkPassword.
export function generatePassword(length = 12) {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = letters + digits;
  const chars = [letters[randInt(letters.length)], digits[randInt(digits.length)]];
  while (chars.length < length) chars.push(all[randInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const k = randInt(i + 1);
    [chars[i], chars[k]] = [chars[k], chars[i]];
  }
  return chars.join('');
}
