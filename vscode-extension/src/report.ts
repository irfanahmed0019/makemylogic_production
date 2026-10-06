import { AnalysisResult } from './analysis/types';

export function formatTeacherReport(result: AnalysisResult): string {
	const heading = `Logic Analyser report — ${result.language}`;
	if (result.findings.length === 0) { return `${heading}\n\nNo supported logic patterns were found. This is not proof that the code has no logic issues; this prototype checks a small set of local rules.`; }
	const issues = result.findings.map((item, index) => `${index + 1}. ${item.category} on line ${item.line} (${item.severity})\nWhat your code currently does: ${item.whatItDoes}\nWhy this may be a reasoning problem: ${item.whyItMayMatter}\nExample: ${item.example}\nHint: ${item.hint}\nPossible correction: ${item.possibleCorrection}`).join('\n\n');
	return `${heading}\n\n${issues}`;
}
