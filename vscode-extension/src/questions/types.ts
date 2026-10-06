export type SupportedLanguage = 'python';
export type QuestionDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface QuestionTest {
	name: string;
	description: string;
}

/** A portable learning exercise that can eventually come from an AI-backed service. */
export interface Question {
	id: string;
	title: string;
	description: string;
	language: SupportedLanguage;
	difficulty: QuestionDifficulty;
	tags: string[];
	requirements: string[];
	starterCode?: string;
	tests?: QuestionTest[];
}

export interface GenerateQuestionRequest {
	language: SupportedLanguage;
	difficulty?: QuestionDifficulty;
	tags?: string[];
}
