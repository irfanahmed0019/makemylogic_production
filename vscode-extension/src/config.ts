import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface AppConfig {
	sarvamApiKey?: string;
	supabaseUrl?: string;
	supabaseAnonKey?: string;
	apiBaseUrl: string;
}

export const DEFAULT_REMOTE_API_BASE_URL = 'https://makemylogic-production.vercel.app';
export const DEFAULT_LOCAL_API_BASE_URL = 'http://localhost:8080';

function isExtensionDevelopmentHost(): boolean {
	return vscode.env.appName.toLowerCase().includes('extension development host');
}

function configuredApiBaseUrl(value: string | undefined): string | undefined {
	const trimmed = value?.trim().replace(/\/$/, '');
	if (!trimmed) return undefined;
	try {
		const parsed = new URL(trimmed);
		if (!['http:', 'https:'].includes(parsed.protocol)) return undefined;
		return parsed.toString().replace(/\/$/, '');
	} catch {
		return undefined;
	}
}

/** Loads a local .env for Extension Development Host runs without bundling it. */
export function loadAppConfig(): AppConfig {
	const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const fileValues = workspace ? readDotEnv(path.join(workspace, '.env')) : {};
	const value = (name: string): string | undefined => process.env[name] || fileValues[name];
	return {
		sarvamApiKey: value('SARVAM_API_KEY'),
		supabaseUrl: value('VITE_SUPABASE_URL'),
		supabaseAnonKey: value('VITE_SUPABASE_ANON_KEY'),
		apiBaseUrl: configuredApiBaseUrl(value('BUILDMYLOGIC_API_URL'))
			|| configuredApiBaseUrl(vscode.workspace.getConfiguration('buildMyLogic').get<string>('apiBaseUrl'))
			|| (isExtensionDevelopmentHost() ? DEFAULT_LOCAL_API_BASE_URL : DEFAULT_REMOTE_API_BASE_URL),
	};
}

function readDotEnv(file: string): Record<string, string> {
	try {
		return fs.readFileSync(file, 'utf8').split(/\r?\n/).reduce<Record<string, string>>((values, line) => {
			const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
			if (!match || match[1].startsWith('#')) { return values; }
			const raw = match[2].replace(/^['"]|['"]$/g, '');
			values[match[1]] = raw;
			return values;
		}, {});
	} catch { return {}; }
}
