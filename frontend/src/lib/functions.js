import { supabase } from './supabaseClient';

// Calls an edge function and returns { ok, data } or { ok: false, message }.
// The functions answer errors as { error: "plain message" }; anything else
// (network down, HTML error page) falls back to a generic message so a raw
// response body is never shown to the user.
export async function invokeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return { ok: true, data };

  if (error.name === 'FunctionsFetchError') {
    return { ok: false, message: 'Could not reach the server. Check your connection.' };
  }
  let message = 'Something went wrong. Try again.';
  try {
    const text = await error.context?.text?.();
    const parsed = text ? JSON.parse(text) : null;
    if (parsed?.error) message = parsed.error;
  } catch {
    // body was not JSON -- keep the generic message
  }
  return { ok: false, message };
}
