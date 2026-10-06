export type RemoteSession = { session_id: string; challenge_id: string; title: string; language: string; concept: string; instructions: string; expected_skills: string[]; test_command?: string; status: string; attempts: number; hints_used: number; test_score?: { passed: number; total: number }; latest_mentor_feedback?: string; potential_struggle?: boolean; struggle_signal?: string; extension_status: string; rev?: number; updated_at?: string; checkpoints?: Array<{ index: number; title: string; detail: string; status: 'locked' | 'active' | 'passed' | 'failed'; evidence?: 'not_verified' | 'detected' | 'verified'; attempts: number; lastOutput?: string }>; project_review?: { score: number; verdict: string; strengths: string[]; issues: string[]; missing: string[]; nextSteps: string[] }; run_guidance?: string };

export type StateQuery = { since?: number; waitMs?: number };

export class SessionClient {
  private baseUrl: string;
  public constructor(baseUrl: string) { this.baseUrl = baseUrl.replace(/\/$/, ''); }
  public setBaseUrl(baseUrl: string) { this.baseUrl = baseUrl.replace(/\/$/, ''); }
  public getBaseUrl() { return this.baseUrl; }
  private async request(path: string, init: RequestInit = {}, timeoutMs = 10000) {
    const response = await fetch(this.baseUrl + path, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs), headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    const body = await response.text();
    let json: { ok?: boolean; error?: string; session?: RemoteSession; state?: RemoteSession; guidance?: string; recovery?: string; mini_task?: string; run_plan?: { command: string; guidance: string; platform: string }; review?: Record<string, unknown>; file_count?: number };
    try {
      json = JSON.parse(body) as typeof json;
    } catch {
      throw new Error(`BuildMyLogic returned an invalid response (${response.status}). Check that the website server is running.`);
    }
    if (!response.ok || !json.ok) { throw new Error(json.error || 'BuildMyLogic could not reach the learning session.'); }
    return json;
  }
  public async connect(sessionId: string) {
    const configured = this.baseUrl;
    const candidates = [configured, 'https://makemylogic-production.vercel.app', 'http://127.0.0.1:8080', 'http://localhost:8080'];
    try {
      const current = new URL(configured);
      if (current.hostname === 'localhost' || current.hostname === '127.0.0.1') {
        candidates.push(`${current.protocol}//${current.hostname === 'localhost' ? '127.0.0.1' : 'localhost'}${current.port ? `:${current.port}` : ''}`);
      } else if (current.hostname === 'makemylogic-production.vercel.app') {
        candidates.push('http://127.0.0.1:8080', 'http://localhost:8080');
      }
    } catch { /* Keep the configured endpoint error below. */ }

    let lastError: unknown;
    for (const candidate of [...new Set(candidates)]) {
      this.baseUrl = candidate;
      try {
        return await this.request('/api/sessions/connect', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) });
      } catch (error) {
        lastError = error;
      }
    }
    this.baseUrl = configured;
    throw lastError instanceof Error ? lastError : new Error('BuildMyLogic could not connect this Session ID.');
  }
  /**
   * Read the session. With `since` + `waitMs` the server holds the request until
   * the state actually changes (long-poll), which is how website edits reach
   * VS Code instantly instead of on a fixed timer.
   */
  public state(sessionId: string, query: StateQuery = {}) {
    const params = new URLSearchParams();
    if (typeof query.since === 'number' && Number.isFinite(query.since)) params.set('since', String(query.since));
    const waitMs = Math.max(0, Math.min(query.waitMs ?? 0, 8000));
    if (waitMs > 0) params.set('wait', String(waitMs));
    const search = params.toString();
    const path = '/api/sessions/' + encodeURIComponent(sessionId) + '/state' + (search ? `?${search}` : '');
    // The request legitimately stays open for `waitMs`, so outlive it.
    return this.request(path, {}, waitMs > 0 ? waitMs + 8000 : 10000);
  }
  public event(sessionId: string, eventType: string, payload: Record<string, unknown>) { return this.request('/api/sessions/' + encodeURIComponent(sessionId) + '/events', { method: 'POST', body: JSON.stringify({ event_type: eventType, payload }) }); }
  public heartbeat(sessionId: string) { return this.event(sessionId, 'heartbeat', {}); }
  public test(sessionId: string, result: Record<string, unknown>) { return this.request('/api/sessions/' + encodeURIComponent(sessionId) + '/test-result', { method: 'POST', body: JSON.stringify(result) }); }
  public hint(sessionId: string, stuck = false) { return this.request('/api/sessions/' + encodeURIComponent(sessionId) + '/' + (stuck ? 'stuck' : 'hint'), { method: 'POST', body: '{}' }); }
  public fail(sessionId: string, reason: string) { return this.request('/api/sessions/' + encodeURIComponent(sessionId) + '/failed', { method: 'POST', body: JSON.stringify({ reason }) }); }
  public runPlan(sessionId: string, platform: string) { return this.request('/api/sessions/' + encodeURIComponent(sessionId) + '/run-plan', { method: 'POST', body: JSON.stringify({ platform }) }); }
  public submit(sessionId: string, files: Array<{ path: string; content: string }>) { return this.request('/api/sessions/' + encodeURIComponent(sessionId) + '/submit', { method: 'POST', body: JSON.stringify({ files }) }); }
}
