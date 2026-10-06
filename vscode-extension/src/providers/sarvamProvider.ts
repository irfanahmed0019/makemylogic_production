import * as crypto from 'crypto';
import { AnalysisFinding, AnalysisResult, FindingCategory, FindingSeverity } from '../analysis/types';
import { GenerateQuestionRequest, Question, QuestionDifficulty, QuestionTest } from '../questions/types';
import { CodeFeedback, FeedbackProvider, Hint, ProviderResponse, QuestionProvider } from './types';

type AiQuestion = Omit<Question, 'id' | 'language'>;
type Grade = { passed: number; total: number; tests: Array<{ name: string; passed: boolean; detail: string }>; feedback: string };
const failure = <T>(code: 'UNAVAILABLE' | 'INVALID_REQUEST' | 'ANALYSIS_FAILED', message: string, cause?: unknown): ProviderResponse<T> => ({ ok: false, error: { code, message, cause } });

/** Sarvam-backed teacher. The key stays in the extension host and is never sent to the webview. */
export class SarvamLearningProvider implements FeedbackProvider, QuestionProvider {
	public constructor(private readonly apiKey?: string) {}

	public async listQuestions(): Promise<ProviderResponse<Question[]>> {
		const question = await this.generateQuestion({ language: 'python' });
		return question.ok ? { ok: true, value: [question.value] } : question;
	}
	public async getQuestion(id: string): Promise<ProviderResponse<Question>> { return failure('INVALID_REQUEST', `AI questions are generated on demand; "${id}" cannot be reloaded.`); }
	public async generateQuestion(request: GenerateQuestionRequest): Promise<ProviderResponse<Question>> {
		if (request.language !== 'python') { return failure('INVALID_REQUEST', 'BuildMyLogic currently generates Python challenges only.'); }
		const difficulty = request.difficulty ?? 'Easy';
		try {
			const data = await this.askJson<AiQuestion>('Create one original, practical Python learning challenge. Return JSON only with title, description, difficulty (Easy, Medium, or Hard), tags (string array), requirements (3-5 strings), starterCode, and tests (array of {name, description}). Do not use a tutorial exercise verbatim. Difficulty: ' + difficulty + '. Focus tags: ' + (request.tags?.join(', ') || 'core Python') + '.');
			return { ok: true, value: normaliseQuestion(data, difficulty) };
		} catch (cause) { return failure('UNAVAILABLE', 'AI challenge generation is unavailable. Check SARVAM_API_KEY and your network connection.', cause); }
	}
	public async analyzeCode(code: string, question?: Question): Promise<ProviderResponse<CodeFeedback>> {
		try {
			const data = await this.askJson<{ summary: string; findings: Partial<AnalysisFinding>[] }>('You are a supportive programming teacher. Review this Python code' + (question ? ' for the challenge "' + question.title + '"' : '') + '. Return JSON only: {summary: string, findings: [{line:number, category:"Error"|"Possible logic issue"|"Learning opportunity"|"Suggestion", severity:"error"|"warning"|"information"|"hint", whatItDoes:string, whyItMayMatter:string, example:string, hint:string, possibleCorrection:string}]}. Be specific, concise, and do not invent errors. Code:\n```python\n' + code + '\n```');
			return { ok: true, value: { summary: String(data.summary || 'AI review complete.'), analysis: { language: 'python', findings: (data.findings || []).map(normaliseFinding) }, source: 'ai' } };
		} catch (cause) { return failure('ANALYSIS_FAILED', 'AI code review is unavailable. Check SARVAM_API_KEY and try again.', cause); }
	}
	public async generateHint(question: Question, code?: string): Promise<ProviderResponse<Hint>> {
		try {
			const data = await this.askJson<{ hint: string }>('Give exactly one short, Socratic hint for this Python challenge. Do not give a complete solution. Challenge: ' + question.description + '\nRequirements: ' + question.requirements.join('; ') + (code ? '\nLearner code:\n```python\n' + code + '\n```' : ''));
			return { ok: true, value: { text: String(data.hint || 'Break the first requirement into a small condition.'), source: 'ai' } };
		} catch (cause) { return failure('UNAVAILABLE', 'AI hint generation is unavailable. Check SARVAM_API_KEY and try again.', cause); }
	}
	public async gradeCode(code: string, question: Question): Promise<ProviderResponse<Grade>> {
		try {
			const data = await this.askJson<Grade>('Evaluate the learner Python code against this challenge. Do not claim you executed code; reason from the code. Return JSON only: {passed:number,total:number,tests:[{name:string,passed:boolean,detail:string}],feedback:string}. Use the challenge tests/requirements as checks. Challenge: ' + JSON.stringify({ description: question.description, requirements: question.requirements, tests: question.tests }) + '\nCode:\n```python\n' + code + '\n```');
			const tests = Array.isArray(data.tests) ? data.tests.slice(0, 8).map(test => ({ name: String(test.name || 'Requirement'), passed: Boolean(test.passed), detail: String(test.detail || '') })) : [];
			const passed = Math.max(0, Math.min(tests.length, Number(data.passed) || tests.filter(test => test.passed).length));
			return { ok: true, value: { passed, total: Math.max(tests.length, Number(data.total) || 0), tests, feedback: String(data.feedback || 'AI review complete.') } };
		} catch (cause) { return failure('UNAVAILABLE', 'AI test review is unavailable. Check SARVAM_API_KEY and try again.', cause); }
	}
	private async askJson<T>(prompt: string): Promise<T> {
		if (!this.apiKey) { throw new Error('SARVAM_API_KEY is missing'); }
		const response = await fetch('https://api.sarvam.ai/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-subscription-key': this.apiKey }, body: JSON.stringify({ model: 'sarvam-105b', temperature: 0.25, max_tokens: 1300, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'You are BuildMyLogic, a careful Python learning assistant. Return valid JSON only.' }, { role: 'user', content: prompt }] }) });
		if (!response.ok) { throw new Error('Sarvam returned ' + response.status); }
		const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
		const text = body.choices?.[0]?.message?.content;
		if (!text) { throw new Error('Sarvam returned no content'); }
		return JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')) as T;
	}
}

function normaliseQuestion(value: AiQuestion, fallbackDifficulty: QuestionDifficulty): Question {
	const difficulties: QuestionDifficulty[] = ['Easy', 'Medium', 'Hard'];
	const tests = Array.isArray(value.tests) ? value.tests.map(test => ({ name: String(test.name || 'Requirement'), description: String(test.description || '') })) : [];
	return { id: crypto.randomUUID(), title: String(value.title || 'Python practice challenge'), description: String(value.description || 'Write a small Python program.'), language: 'python', difficulty: difficulties.includes(value.difficulty) ? value.difficulty : fallbackDifficulty, tags: Array.isArray(value.tags) ? value.tags.map(String).slice(0, 6) : ['Python'], requirements: Array.isArray(value.requirements) ? value.requirements.map(String).slice(0, 6) : ['Write a clear Python solution.'], starterCode: typeof value.starterCode === 'string' ? value.starterCode : undefined, tests: tests as QuestionTest[] };
}
function normaliseFinding(value: Partial<AnalysisFinding>): AnalysisFinding {
	const categories: FindingCategory[] = ['Error', 'Possible logic issue', 'Learning opportunity', 'Suggestion'];
	const severities: FindingSeverity[] = ['error', 'warning', 'information', 'hint'];
	return { line: Math.max(1, Number(value.line) || 1), category: categories.includes(value.category as FindingCategory) ? value.category as FindingCategory : 'Suggestion', severity: severities.includes(value.severity as FindingSeverity) ? value.severity as FindingSeverity : 'information', whatItDoes: String(value.whatItDoes || ''), whyItMayMatter: String(value.whyItMayMatter || ''), example: String(value.example || ''), hint: String(value.hint || ''), possibleCorrection: String(value.possibleCorrection || ''), patterns: [] };
}
