import { AnalysisResult } from '../analysis/types';
import { GenerateQuestionRequest, Question } from '../questions/types';

export interface ProviderError {
	code: 'EMPTY_CATALOGUE' | 'NOT_FOUND' | 'UNAVAILABLE' | 'INVALID_REQUEST' | 'ANALYSIS_FAILED';
	message: string;
	cause?: unknown;
}

export type ProviderResponse<T> =
	| { ok: true; value: T }
	| { ok: false; error: ProviderError };

export interface CodeFeedback {
	summary: string;
	analysis: AnalysisResult;
	source: 'local-rules' | 'ai';
}

export interface Hint {
	text: string;
	source: 'local' | 'ai';
}

/** Contract for a future remote question service. It must never contain credentials. */
export interface QuestionProvider {
	listQuestions(): Promise<ProviderResponse<Question[]>>;
	getQuestion(id: string): Promise<ProviderResponse<Question>>;
	generateQuestion(request: GenerateQuestionRequest): Promise<ProviderResponse<Question>>;
}

/** Contract for a future feedback service. */
export interface FeedbackProvider {
	analyzeCode(code: string, question?: Question): Promise<ProviderResponse<CodeFeedback>>;
	generateHint(question: Question, code?: string): Promise<ProviderResponse<Hint>>;
}
