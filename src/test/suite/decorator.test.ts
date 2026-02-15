import * as assert from 'assert';
import {suite, test} from 'mocha';
import * as vscode from 'vscode';
import {Decorator} from '../../decorator';

async function setupEditor(content: string) {
	const doc = await vscode.workspace.openTextDocument({
		language: 'markdown',
		content,
	});
	const editor = await vscode.window.showTextDocument(doc);
	const decorator = new Decorator();
	decorator.setActiveEditor(editor);
	return {editor, decorator, doc};
}

suite('Decorator – code block filtering', () => {
	test('headings inside fenced code blocks are not decorated', async () => {
		const {decorator, doc} = await setupEditor([
			'# Real heading',
			'',
			'```python',
			'# this is a comment',
			'## another comment',
			'```',
			'',
			'## Another real heading',
		].join('\n'));

		const documentText = doc.getText();
		const codeBlockRanges = decorator.getCodeBlockRanges(documentText);
		assert.ok(codeBlockRanges.length > 0, 'should detect the fenced code block');

		const filtered = decorator.headings(documentText).filter((d) => !Decorator.isInsideCodeBlock(d.parent, codeBlockRanges));

		const uniqueLines = new Set(filtered.map((d) => d.parent.start.line));
		assert.ok(uniqueLines.has(0), '"# Real heading" (line 0) should be decorated');
		assert.ok(uniqueLines.has(7), '"## Another real heading" (line 7) should be decorated');
		assert.ok(!uniqueLines.has(3), '"# this is a comment" inside code block should not be decorated');
		assert.ok(!uniqueLines.has(4), '"## another comment" inside code block should not be decorated');
	});

	test('bold/italic inside fenced code blocks are not decorated', async () => {
		const {decorator, doc} = await setupEditor([
			'**real bold**',
			'',
			'```',
			'**not bold**',
			'_not italic_',
			'```',
			'',
			'_real italic_',
		].join('\n'));

		const documentText = doc.getText();
		const codeBlockRanges = decorator.getCodeBlockRanges(documentText);

		const boldLines = new Set(decorator.bold(documentText)
			.filter((d) => !Decorator.isInsideCodeBlock(d.parent, codeBlockRanges))
			.map((d) => d.parent.start.line));
		const italicLines = new Set(decorator.italic(documentText)
			.filter((d) => !Decorator.isInsideCodeBlock(d.parent, codeBlockRanges))
			.map((d) => d.parent.start.line));

		assert.ok(boldLines.has(0), '"**real bold**" should be decorated');
		assert.ok(!boldLines.has(3), '"**not bold**" inside code block should not be decorated');
		assert.ok(italicLines.has(7), '"_real italic_" should be decorated');
		assert.ok(!italicLines.has(4), '"_not italic_" inside code block should not be decorated');
	});

	test('tilde fenced code blocks also exclude decorations', async () => {
		const {decorator, doc} = await setupEditor([
			'~~~',
			'# heading inside tilde fence',
			'**bold inside tilde fence**',
			'~~~',
		].join('\n'));

		const documentText = doc.getText();
		const codeBlockRanges = decorator.getCodeBlockRanges(documentText);
		assert.ok(codeBlockRanges.length > 0, 'should detect tilde-fenced code block');

		const headings = decorator.headings(documentText).filter((d) => !Decorator.isInsideCodeBlock(d.parent, codeBlockRanges));
		const bold = decorator.bold(documentText).filter((d) => !Decorator.isInsideCodeBlock(d.parent, codeBlockRanges));

		assert.strictEqual(headings.length, 0, 'no headings should survive filtering');
		assert.strictEqual(bold.length, 0, 'no bold should survive filtering');
	});

	test('inline code content is excluded from other decorations', async () => {
		const {decorator, doc} = await setupEditor('Some `**not bold**` text and **real bold**.');

		const documentText = doc.getText();
		const codeBlockRanges = decorator.getCodeBlockRanges(documentText);

		const boldDecorations = decorator.bold(documentText).filter((d) => !Decorator.isInsideCodeBlock(d.parent, codeBlockRanges));

		assert.strictEqual(boldDecorations.length, 2, 'should have 2 bold decorations (hide + color) for the real bold only');
		boldDecorations.forEach((d) => {
			assert.ok(
				d.range.start.character >= 25,
				'bold decoration should only be for "**real bold**" near end of line',
			);
		});
	});

	test('decorations outside code blocks are unaffected', async () => {
		const {decorator, doc} = await setupEditor([
			'# Heading 1',
			'',
			'**bold text**',
			'',
			'```',
			'code here',
			'```',
			'',
			'_italic text_',
		].join('\n'));

		const documentText = doc.getText();
		const codeBlockRanges = decorator.getCodeBlockRanges(documentText);

		const headings = decorator.headings(documentText).filter((d) => !Decorator.isInsideCodeBlock(d.parent, codeBlockRanges));
		const bold = decorator.bold(documentText).filter((d) => !Decorator.isInsideCodeBlock(d.parent, codeBlockRanges));
		const italic = decorator.italic(documentText).filter((d) => !Decorator.isInsideCodeBlock(d.parent, codeBlockRanges));

		assert.ok(headings.length > 0, 'heading decorations should still apply');
		assert.ok(bold.length > 0, 'bold decorations should still apply');
		assert.ok(italic.length > 0, 'italic decorations should still apply');
	});
});
