import { ProviderResponse, QuestionProvider } from '../providers/types';
import { Question } from './types';

/** Keeps question navigation independent of VS Code and any future AI transport. */
export class QuestionSession {
	private questions: Question[] = [];
	private currentIndex = -1;

	public constructor(private readonly provider: QuestionProvider) {}

	public async load(): Promise<ProviderResponse<Question | undefined>> {
		const response = await this.provider.listQuestions();
		if (!response.ok) { return response; }
		this.questions = response.value;
		this.currentIndex = this.questions.length ? 0 : -1;
		return { ok: true, value: this.currentQuestion() };
	}

	public async next(): Promise<ProviderResponse<Question | undefined>> {
		if (!this.questions.length) { return { ok: true, value: undefined }; }
		this.currentIndex = (this.currentIndex + 1) % this.questions.length;
		return { ok: true, value: this.currentQuestion() };
	}

	/** Requests a fresh challenge from a generative provider and makes it current. */
	public async generate(request: import('./types').GenerateQuestionRequest): Promise<ProviderResponse<Question>> {
		const response = await this.provider.generateQuestion(request);
		if (!response.ok) { return response; }
		this.questions = [response.value];
		this.currentIndex = 0;
		return response;
	}

	public currentQuestion(): Question | undefined { return this.questions[this.currentIndex]; }
}
