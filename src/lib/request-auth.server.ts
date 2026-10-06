/** Validate access tokens with Supabase, never by decoding unverified claims. */
export async function authenticatedUserId(request: Request): Promise<string | undefined> {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  const token = /^bearer /i.test(authorization) ? authorization.slice(7).trim() : '';
  const url = process.env['VITE_SUPABASE_URL']?.trim();
  const key = process.env['VITE_SUPABASE_ANON_KEY']?.trim();
  if (!token || !url || !key) return undefined;
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return undefined;
    const user = await response.json() as { id?: unknown };
    return typeof user.id === 'string' && /^[0-9a-f-]{36}$/i.test(user.id) ? user.id : undefined;
  } catch { return undefined; }
}
