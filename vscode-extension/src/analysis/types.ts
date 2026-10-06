export type FindingCategory = 'Error' | 'Possible logic issue' | 'Learning opportunity' | 'Suggestion';
export type FindingSeverity = 'error' | 'warning' | 'information' | 'hint';

// Reserved for future, optional learning-history support; no data is persisted yet.
export type ReasoningPattern = 'assignment-vs-comparison' | 'and-or-confusion' | 'reversed-condition' | 'off-by-one' | 'wrong-variable' | 'loop-variable-not-updated';

export interface AnalysisFinding {
	line: number;
	category: FindingCategory;
	severity: FindingSeverity;
	whatItDoes: string;
	whyItMayMatter: string;
	example: string;
	hint: string;
	possibleCorrection: string;
	patterns: ReasoningPattern[];
}

export interface AnalysisResult { language: string; findings: AnalysisFinding[]; }
