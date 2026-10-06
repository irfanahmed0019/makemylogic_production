import { analysePython } from '../analysis/pythonRules';
import { localPythonQuestions } from '../questions/localQuestions';
import { GenerateQuestionRequest, Question } from '../questions/types';
import { CodeFeedback, FeedbackProvider, Hint, ProviderResponse, QuestionProvider } from './types';

const failure = <T>(code: 'EMPTY_CATALOGUE' | 'NOT_FOUND' | 'INVALID_REQUEST' | 'ANALYSIS_FAILED', message: string, cause?: unknown): ProviderResponse<T> =>
	({ ok: false, error: { code, message, cause } });

export class LocalQuestionProvider implements QuestionProvider {
	public constructor(private readonly questions: Question[] = localPythonQuestions) {}

	public async listQuestions(): Promise<ProviderResponse<Question[]>> {
		return this.questions.length ? { ok: true, value: [...this.questions] } : failure('EMPTY_CATALOGUE', 'No local learning questions are available.');
	}

	public async getQuestion(id: string): Promise<ProviderResponse<Question>> {
		const question = this.questions.find(item => item.id === id);
		return question ? { ok: true, value: question } : failure('NOT_FOUND', `Question "${id}" was not found.`);
	}

	public async generateQuestion(request: GenerateQuestionRequest): Promise<ProviderResponse<Question>> {
		if (request.language !== 'python') { return failure('INVALID_REQUEST', 'The local provider currently supports Python only.'); }
		const filtered = this.questions.filter(question =>
			(!request.difficulty || question.difficulty === request.difficulty) &&
			(!request.tags?.length || request.tags.every(tag => question.tags.includes(tag))));
		return filtered[0] ? { ok: true, value: filtered[0] } : failure('NOT_FOUND', 'No local question matches that request.');
	}
}

/** Local fallback until a server-backed FeedbackProvider is configured. */
export class LocalFeedbackProvider implements FeedbackProvider {
	public async analyzeCode(code: string): Promise<ProviderResponse<CodeFeedback>> {
		try {
			const analysis = analysePython(code);
			return { ok: true, value: { summary: analysis.findings.length ? 'Local Python rules found possible learning opportunities.' : 'Local Python rules found no issues in this selection.', analysis, source: 'local-rules' } };
		} catch (cause) {
			return failure('ANALYSIS_FAILED', 'The local Python analyser could not process this code.', cause);
		}
	}

	public async generateHint(question: Question): Promise<ProviderResponse<Hint>> {
		return { ok: true, value: { text: question.requirements[0] ?? 'Break the problem into a small first step.', source: 'local' } };
	}
}
