import { AppConfig } from './config';

/** Best-effort anonymous event storage. A missing table/RLS policy never breaks learning. */
export class SupabaseProgressStore {
	public constructor(private readonly config: AppConfig) {}
	public get enabled(): boolean { return Boolean(this.config.supabaseUrl && this.config.supabaseAnonKey); }
	public async record(eventType: string, payload: Record<string, unknown>): Promise<void> {
		if (!this.enabled) { return; }
		try {
			await fetch(this.config.supabaseUrl!.replace(/\/$/, '') + '/rest/v1/learning_events', { method: 'POST', headers: { apikey: this.config.supabaseAnonKey!, Authorization: 'Bearer ' + this.config.supabaseAnonKey!, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ event_type: eventType, payload }) });
		} catch { /* Offline persistence is intentionally non-blocking. */ }
	}
}
