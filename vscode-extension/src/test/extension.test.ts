import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { analysePython } from '../analysis/pythonRules';
import { LocalFeedbackProvider, LocalQuestionProvider } from '../providers/localProviders';
import { QuestionSession } from '../questions/questionSession';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('detects an impossible numeric condition', () => {
		const result = analysePython('if age > 18 and age < 10:\n    print("impossible")');
		assert.strictEqual(result.findings.length, 1);
		assert.strictEqual(result.findings[0].category, 'Possible logic issue');
		assert.strictEqual(result.findings[0].line, 1);
	});

	test('suggests a simpler boolean comparison', () => {
		const result = analysePython('if is_logged_in == True:\n    pass');
		assert.strictEqual(result.findings[0].category, 'Suggestion');
	});

	test('loads the first local question', async () => {
		const session = new QuestionSession(new LocalQuestionProvider());
		const result = await session.load();
		assert.strictEqual(result.ok, true);
		if (result.ok) { assert.strictEqual(result.value?.id, 'voting-eligibility'); }
	});

	test('switches local questions', async () => {
		const session = new QuestionSession(new LocalQuestionProvider());
		await session.load();
		const result = await session.next();
		assert.strictEqual(result.ok, true);
		if (result.ok) { assert.strictEqual(result.value?.id, 'cli-calculator'); }
	});

	test('handles an empty local question catalogue', async () => {
		const session = new QuestionSession(new LocalQuestionProvider([]));
		const result = await session.load();
		assert.strictEqual(result.ok, false);
		if (!result.ok) { assert.strictEqual(result.error.code, 'EMPTY_CATALOGUE'); }
	});

	test('uses local analyser feedback as the fallback', async () => {
		const provider = new LocalFeedbackProvider();
		const result = await provider.analyzeCode('if age > 18 and age < 10:\n    pass');
		assert.strictEqual(result.ok, true);
		if (result.ok) {
			assert.strictEqual(result.value.source, 'local-rules');
			assert.strictEqual(result.value.analysis.findings.length, 1);
		}
	});
});
