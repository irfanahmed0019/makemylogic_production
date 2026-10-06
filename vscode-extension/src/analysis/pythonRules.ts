import { AnalysisFinding, AnalysisResult, FindingCategory, FindingSeverity } from './types';

interface Comparison { variable: string; operator: string; value: number; }
interface Compound { left: Comparison; joiner: 'and' | 'or'; right: Comparison; }

const comparison = /^\s*(\w+)\s*(==|>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)\s*$/;
const makeFinding = (line: number, category: FindingCategory, severity: FindingSeverity, whatItDoes: string, whyItMayMatter: string, example: string, hint: string, possibleCorrection: string, patterns: AnalysisFinding['patterns']): AnalysisFinding =>
	({ line, category, severity, whatItDoes, whyItMayMatter, example, hint, possibleCorrection, patterns });

function parseComparison(text: string): Comparison | undefined {
	const match = text.match(comparison);
	return match ? { variable: match[1], operator: match[2], value: Number(match[3]) } : undefined;
}

function parseCompound(line: string): Compound | undefined {
	const match = line.match(/^\s*(?:if|elif)\s+(.+?)\s+(and|or)\s+(.+?)\s*:\s*(?:#.*)?$/);
	if (!match) { return undefined; }
	const left = parseComparison(match[1]);
	const right = parseComparison(match[3]);
	return left && right && left.variable === right.variable ? { left, joiner: match[2] as 'and' | 'or', right } : undefined;
}

function bounds(c: Compound): { lower?: Comparison; upper?: Comparison } {
	const values = [c.left, c.right];
	return { lower: values.find(value => value.operator === '>' || value.operator === '>='), upper: values.find(value => value.operator === '<' || value.operator === '<=') };
}

function impossibleAnd(c: Compound): boolean {
	if (c.left.operator === '==' && c.right.operator === '==' && c.left.value !== c.right.value) { return true; }
	const { lower, upper } = bounds(c);
	return Boolean(lower && upper && (lower.value > upper.value || (lower.value === upper.value && (lower.operator === '>' || upper.operator === '<'))));
}

function alwaysTrueOr(c: Compound): boolean {
	const { lower, upper } = bounds(c);
	return Boolean(lower && upper && (lower.value < upper.value || (lower.value === upper.value && (lower.operator === '>=' || upper.operator === '<='))));
}

function compoundFindings(line: string, number: number, findings: AnalysisFinding[]): void {
	const c = parseCompound(line);
	if (!c) { return; }
	if (c.joiner === 'and' && impossibleAnd(c)) {
		findings.push(makeFinding(number, 'Possible logic issue', 'warning', `Your condition requires ${c.left.variable} to satisfy contradictory comparisons at the same time.`, 'This condition cannot be true, so its branch will never run.', 'No number can be both greater than 18 and less than 10.', 'Can one value meet both requirements?', 'Check whether you meant "or" instead of "and", or whether a boundary is wrong.', ['and-or-confusion']));
	}
	if (c.joiner === 'or' && alwaysTrueOr(c)) {
		findings.push(makeFinding(number, 'Possible logic issue', 'warning', 'For normal numeric values, at least one side of this "or" condition is true.', `The condition may always be true, so an else branch may never run. Exact behavior still depends on ${c.left.variable}'s type.`, 'Every number is either greater than 10 or less than 20.', 'What number would make both sides false?', 'Check whether you meant "and" to describe a range.', ['and-or-confusion']));
	}
}

function simpleFindings(lines: string[], index: number, findings: AnalysisFinding[]): void {
	const line = lines[index]; const number = index + 1;
	const booleanMatch = line.match(/^\s*(?:if|elif)\s+(\w+)\s*==\s*(True|False)\s*:/);
	if (booleanMatch) {
		const [, variable, value] = booleanMatch;
		findings.push(makeFinding(number, 'Suggestion', 'hint', `Your condition explicitly compares ${variable} with ${value}.`, 'This is valid Python, but a direct boolean condition is usually easier to read.', `Use "if ${variable}:" for a true check.`, 'Is this variable already a boolean?', value === 'True' ? `Consider "if ${variable}:".` : `Consider "if not ${variable}:".`, []));
	}
	const literalMatch = line.match(/^\s*if\s+(True|False)\s*:/);
	if (literalMatch) {
		const truth = literalMatch[1] === 'True';
		findings.push(makeFinding(number, 'Learning opportunity', 'information', `This condition is always ${truth ? 'true' : 'false'}.`, truth ? 'A paired else branch can never run.' : 'The body of this if statement can never run.', '"if False:" always skips its body.', 'Is this temporary code, or should it depend on a value?', truth ? 'Remove the condition or replace it with a real check.' : 'Replace it with the intended condition or remove unreachable code.', []));
	}
	const condition = line.match(/^\s*(?:if|elif)\s+(\w+)\s*(>=|>)\s*(\d+)/);
	if (condition && /under|minor|less than|below/.test(lines[index - 1]?.toLowerCase() ?? '')) {
		findings.push(makeFinding(number, 'Possible logic issue', 'warning', `The comment describes being under ${condition[3]}, while the condition checks ${condition[1]} ${condition[2]} ${condition[3]}.`, 'The code and comment appear to describe opposite groups.', '# Check if the user is under 18 followed by if age >= 18: checks adults.', 'Does the comparison match the group named in the comment?', 'Review the comment and boundary; an "under" check may need < or <=.', ['reversed-condition']));
	}
	const reversed = line.match(/^\s*if\s+(\w+)\s*>=\s*18\s*:/);
	const nearby = lines.slice(index + 1, index + 8).join('\n').toLowerCase();
	const body = lines.slice(index + 1, index + 4).join('\n').toLowerCase();
	if (reversed && /print\s*\(\s*["'].*minor/.test(body) && /else\s*:/.test(nearby) && /print\s*\(\s*["'].*adult/.test(nearby)) {
		findings.push(makeFinding(number, 'Possible logic issue', 'warning', `When ${reversed[1]} is 18 or more, the first branch prints "Minor"; otherwise it prints "Adult".`, 'Those labels look reversed for the condition being checked.', 'At age 20, this code prints "Minor".', 'Trace one adult age and one younger age through the branches.', 'Swap the messages, or reverse the comparison if the labels express your intent.', ['reversed-condition']));
	}
}

/** Conservative local rules. Add independent rules here as the analyser grows. */
export function analysePython(code: string): AnalysisResult {
	const lines = code.split(/\r?\n/); const findings: AnalysisFinding[] = [];
	lines.forEach((line, index) => { compoundFindings(line, index + 1, findings); simpleFindings(lines, index, findings); });
	return { language: 'Python', findings };
}
