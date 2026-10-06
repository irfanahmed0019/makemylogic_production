/**
 * TEMPORARY SWITCH — sign-in is paused while the product is being tested.
 *
 * While `true` the whole app runs signed out:
 *   - no Google / Supabase sign-in UI is rendered,
 *   - the server accepts session creation without a bearer token,
 *   - progress lives in this browser's localStorage only (no cloud copy).
 *
 * Flip back to `false` (and remove the guards that read it) to restore auth.
 */
export const AUTH_TEMPORARILY_DISABLED = true;
