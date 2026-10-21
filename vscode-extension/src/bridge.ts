import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import * as vscode from 'vscode';

/**
 * Local desktop bridge hosted by the extension itself.
 *
 * The BuildMyLogic website talks to http://127.0.0.1:8091 to pick a project
 * folder and open it in VS Code. Previously this bridge only existed inside
 * the web repo's `npm run dev`, so learners on the live site were told to
 * start a development server. Hosting it here makes Open VS Code work for
 * anyone who has VS Code running with this extension installed.
 */

export const BRIDGE_PORT = 8091;

const PENDING_SESSION_KEY = 'buildMyLogic.pendingSessionConnect';

const ALLOWED_ORIGINS = new Set([
	'http://localhost:8080',
	'http://127.0.0.1:8080',
	'https://buildmylogic.vercel.app',
	'https://makemylogicproductiondddd.vercel.app',
	'https://buildmylogic-app.vercel.app',
	'https://makemylogic-production.vercel.app',
]);

const ALLOWED_HOSTS = new Set([
	`127.0.0.1:${BRIDGE_PORT}`,
	`localhost:${BRIDGE_PORT}`,
]);

export interface SessionConnect {
	sessionId: string;
	apiBaseUrl: string;
}

type StagedSessionConnect = SessionConnect & { at: number };

export interface BridgeHandlers {
	/** Connect an active learning session in the current window. */
	connectSession(connect: SessionConnect): Promise<void>;
	extensionVersion: string;
}

function originAllowed(origin: string | undefined): boolean {
	// Non-browser tools (curl, health probes) send no Origin header.
	if (!origin) return true;
	if (ALLOWED_ORIGINS.has(origin)) return true;
	try {
		const url = new URL(origin);
		return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
	} catch {
		return false;
	}
}

function json(res: http.ServerResponse, status: number, body: unknown, origin?: string): void {
	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
		...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
	});
	res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage, limit: number): Promise<string> {
	return new Promise((resolvePromise, rejectPromise) => {
		let body = '';
		req.on('data', (chunk: Buffer) => {
			body += chunk.toString('utf8');
			if (body.length > limit) {
				rejectPromise(new Error('Request body is too large.'));
				req.destroy();
			}
		});
		req.on('end', () => resolvePromise(body));
		req.on('error', rejectPromise);
	});
}

function validFolder(candidate: unknown): string | undefined {
	if (typeof candidate !== 'string' || !candidate.trim()) return undefined;
	const absolute = path.resolve(candidate.trim());
	try {
		return fs.statSync(absolute).isDirectory() ? absolute : undefined;
	} catch {
		return undefined;
	}
}

function validSessionId(candidate: unknown): string | undefined {
	if (typeof candidate !== 'string') return undefined;
	const sessionId = candidate.trim().toUpperCase();
	return /^[A-Z0-9][A-Z0-9_-]{5,39}$/.test(sessionId) ? sessionId : undefined;
}

function validApiBaseUrl(candidate: unknown): string | undefined {
	if (typeof candidate !== 'string' || !candidate.trim()) return undefined;
	try {
		const parsed = new URL(candidate.trim());
		if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
		return parsed.origin;
	} catch {
		return undefined;
	}
}

async function pickFolder(): Promise<string | undefined> {
	const selected = await vscode.window.showOpenDialog({
		canSelectFiles: false,
		canSelectFolders: true,
		canSelectMany: false,
		openLabel: 'Select project folder',
		title: 'Select your BuildMyLogic project folder',
	});
	const folder = selected?.[0]?.fsPath;
	return folder ? path.resolve(folder) : undefined;
}

async function confirmOpen(folderPath: string): Promise<boolean> {
	const name = path.basename(folderPath) || folderPath;
	const choice = await vscode.window.showInformationMessage(
		`BuildMyLogic wants to open "${name}" in VS Code.`,
		'Open Folder',
	);
	return choice === 'Open Folder';
}

async function openFolderInVsCode(folderPath: string, session: SessionConnect | undefined, context: vscode.ExtensionContext, handlers: BridgeHandlers): Promise<void> {
	const current = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const alreadyOpen = current !== undefined && path.resolve(current) === folderPath;
	if (alreadyOpen) {
		// No window reload, so the session can connect immediately.
		if (session) await handlers.connectSession(session);
		return;
	}
	if (session) {
		// `vscode.openFolder` reloads this window and its extension host, so
		// stage the connect first; activate() in the reloaded window runs it.
		const staged: StagedSessionConnect = { ...session, at: Date.now() };
		await context.globalState.update(PENDING_SESSION_KEY, staged);
	}
	await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPath), { forceNewWindow: false });
}

/** Returns a session connect staged before a window reload, once. */
export async function consumeStagedSession(context: vscode.ExtensionContext): Promise<SessionConnect | undefined> {
	const staged = context.globalState.get<StagedSessionConnect>(PENDING_SESSION_KEY);
	await context.globalState.update(PENDING_SESSION_KEY, undefined);
	// Ignore anything stale so an old reload cannot surprise the learner later.
	if (staged && typeof staged.at === 'number' && Date.now() - staged.at < 10 * 60 * 1000 && staged.sessionId) {
		return { sessionId: staged.sessionId, apiBaseUrl: staged.apiBaseUrl };
	}
	return undefined;
}

/**
 * Starts the local bridge. Never throws: if another bridge already owns the
 * port (for example the web repo's `npm run dev` helper, which serves the
 * same API) this one stays out of the way and the rest of the extension is
 * unaffected.
 */
export function startBridge(context: vscode.ExtensionContext, handlers: BridgeHandlers): vscode.Disposable {
	const server = http.createServer((req, res) => {
		void handleRequest(req, res).catch((error: unknown) => {
			const origin = req.headers.origin;
			json(res, 500, { ok: false, error: error instanceof Error ? error.message : 'Local bridge request failed.' }, originAllowed(origin) ? origin : undefined);
		});
	});

	async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const origin = req.headers.origin;
		// Host check defends against DNS-rebinding from arbitrary websites.
		if (!ALLOWED_HOSTS.has(String(req.headers.host || '').toLowerCase())) {
			return json(res, 403, { ok: false, error: 'Host not allowed.' });
		}
		if (!originAllowed(origin)) {
			return json(res, 403, { ok: false, error: 'Origin not allowed.' });
		}
		if (req.method === 'OPTIONS') {
			res.writeHead(204, {
				...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
				'access-control-allow-methods': 'GET, POST, OPTIONS',
				'access-control-allow-headers': 'Content-Type',
			});
			res.end();
			return;
		}

		if (req.method === 'GET' && req.url === '/health') {
			return json(res, 200, {
				ok: true,
				platform: process.platform,
				source: 'buildmylogic-vscode-extension',
				version: handlers.extensionVersion,
			}, origin);
		}

		if (req.method === 'POST' && req.url === '/pick-folder') {
			// The native dialog stays open until the learner chooses; the
			// website's pick-folder request intentionally has no timeout.
			const folder = await pickFolder();
			if (!folder) return json(res, 400, { ok: false, error: 'No folder was selected.' }, origin);
			return json(res, 200, { ok: true, path: folder }, origin);
		}

		if (req.method === 'POST' && (req.url === '/open-vscode' || req.url === '/open-vscode-session')) {
			const body = await readBody(req, 12000);
			let parsed: unknown;
			try {
				parsed = JSON.parse(body || '{}');
			} catch {
				return json(res, 400, { ok: false, error: 'Request body is not valid JSON.' }, origin);
			}
			const fields = parsed as Record<string, unknown>;
			const folder = validFolder(fields.path);
			if (!folder) {
				return json(res, 400, { ok: false, error: 'Project path is missing or is not a folder on this computer.' }, origin);
			}
			let session: SessionConnect | undefined;
			if (req.url === '/open-vscode-session') {
				const sessionId = validSessionId(fields.session_id);
				const apiBaseUrl = validApiBaseUrl(fields.api_base_url);
				if (!sessionId || !apiBaseUrl) {
					return json(res, 400, { ok: false, error: 'A valid BuildMyLogic Session ID and API address are required.' }, origin);
				}
				session = { sessionId, apiBaseUrl };
			}
			// Answer before the in-VS-Code confirmation: the website's request
			// has a short timeout, and the learner confirms the folder inside
			// VS Code itself.
			json(res, 200, { ok: true }, origin);
			void (async () => {
				if (!(await confirmOpen(folder))) return;
				await openFolderInVsCode(folder, session, context, handlers);
			})().catch(() => { /* Opening the folder is best-effort; the website already got its answer. */ });
			return;
		}

		return json(res, 404, { ok: false, error: 'Not found' }, origin);
	}

	server.on('error', (error: NodeJS.ErrnoException) => {
		if (error.code === 'EADDRINUSE') {
			console.log(`[BuildMyLogic] Another local bridge already owns 127.0.0.1:${BRIDGE_PORT}; leaving it in charge.`);
		} else {
			console.error(`[BuildMyLogic] Local bridge error: ${error.message}`);
		}
	});
	server.listen(BRIDGE_PORT, '127.0.0.1');

	return new vscode.Disposable(() => {
		server.close();
	});
}
