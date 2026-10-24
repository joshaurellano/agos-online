import { invokeFunction } from './functions';

// OTP check for a mobile number. Both calls go to edge functions that only
// signed-in staff can use; the server decides whether a code is right.

export const OTP_LENGTH = 6;
export const RESEND_SECONDS = 60;

// The server also refuses a number that is already on the residents list,
// before spending an SMS on it.
export const sendOtp = (phone) => invokeFunction('send-otp', { phone });
export const verifyOtp = (phone, code) => invokeFunction('verify-otp', { phone, code });
