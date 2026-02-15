import {
	Range, type TextEditor, workspace, type TextEditorDecorationType,
} from 'vscode';
import {
	DefaultColorDecorationType, HideDecorationType, XxlTextDecorationType, XlTextDecorationType, LTextDecorationType, URIDecorationType, SpaceAfterDecorationType, HorizontalLineDecorationType,
} from './decorations';
import {type LinkData, type MarkdownDocumentLinkProvider} from './documentLinkProvider';

type Decoration = {
	range: Range;
	type: TextEditorDecorationType;
	parent: Range; // Full range of the markdown syntax element this range belongs to.
};

// Regex patterns for markdown syntax
// Note: not in the respective function to avoid recompilation on each call
const BOLD_REGEX = /(\*{2}|_{2})((?=[^\s*_]).*?[^\s*_])(\1)/g;
const ITALIC_REGEX = /(?<!\*|_)(\*|_)((?=[^\s*_]).*?[^\s*_])(\1)(?!\*|_)/g;
const STRIKETHROUGH_REGEX = /(?<!~)(~{2})((?=[^\s~]).*?[^\s~])(~{2})(?!~)/g;
const INLINE_CODE_REGEX = /(`)((?=[^\s`]).*?[^\s`])(`)/g;
const BLOCK_CODE_REGEX = /((`{3}|~{3})\w*\n)(.*\n)*?(\2\n)/g;
const SIMPLE_URI_REGEX = /(<)([a-z][a-z0-9+.-]*:[^\s<>]+)(>)/gi;
const ALIASED_URI_REGEX = /(\[)([^\]]+)(\]\()([a-z][a-z0-9+.-]*:[^\s)]+)(\))/gi;
const REFERENCE_URI_REGEX = /(\[)([^\]]+)(\])(\s?)(\[)([^\]]+)(\])/g;
const ALL_HEADINGS_REGEX = /^[ \t]*#{1,6}([ \t].*|$)/gm;
const H1_REGEX = /^[ \t]*#{1}([ \t].*|$)/gm;
const H2_REGEX = /^[ \t]*#{2}([ \t].*|$)/gm;
const H3_REGEX = /^[ \t]*#{3}([ \t].*|$)/gm;
const HORIZONTAL_LINE_REGEX = /(?:\r?\n)[ \t]*(?:\r?\n)([ \t]*)(-{3,}|\*{3,}|_{3,})([ \t]*)(?=(?:\r?\n)[ \t]*(?:\r?\n))/g;

export class Decorator {
	/**
	 * Checks if a range overlaps with any code block or inline code range.
	 */
	static isInsideCodeBlock(range: Range, codeBlockRanges: Range[]): boolean {
		return codeBlockRanges.some((codeRange) => codeRange.contains(range));
	}

	activeEditor: TextEditor | undefined;

	linkProvider: MarkdownDocumentLinkProvider | undefined;

	hideDecorationType = HideDecorationType();

	defaultColorDecorationType = DefaultColorDecorationType();

	xxlTextDecorationType = XxlTextDecorationType();

	xlTextDecorationType = XlTextDecorationType();

	lTextDecorationType = LTextDecorationType();

	URIDecorationType = URIDecorationType();

	spaceAfterDecorationType = SpaceAfterDecorationType();

	horizontalLineDecorationType = HorizontalLineDecorationType();

	setLinkProvider(linkProvider: MarkdownDocumentLinkProvider) {
		this.linkProvider = linkProvider;
	}

	setActiveEditor(textEditor: TextEditor | undefined) {
		if (!textEditor) {
			return;
		}

		this.activeEditor = textEditor;
		this.updateDecorations();
	}

	updateDecorations() {
		if (!this.activeEditor) {
			return;
		}

		if (!['markdown', 'md', 'mdx'].includes(this.activeEditor.document.languageId)) {
			return;
		}

		const documentText = this.activeEditor.document.getText();
		const config = workspace.getConfiguration('markdownInlinePreview');

		// Compute code block ranges so we can exclude decorations inside them
		const codeBlockRanges = this.getCodeBlockRanges(documentText);

		// Collect all decorations and link data
		// Code decorations (inlineCode, blockCode) are exempt from code block filtering
		const codeDecorations: Decoration[] = [];
		const allDecorations: Decoration[] = [];
		const allLinks: LinkData[] = [];

		if (config.get<boolean>('bold', true)) {
			allDecorations.push(...this.bold(documentText));
		}

		if (config.get<boolean>('italic', true)) {
			allDecorations.push(...this.italic(documentText));
		}

		if (config.get<boolean>('strikethrough', true)) {
			allDecorations.push(...this.strikethrough(documentText));
		}

		if (config.get<boolean>('inlineCode', true)) {
			codeDecorations.push(...this.inlineCode(documentText));
		}

		if (config.get<boolean>('blockCode', true)) {
			codeDecorations.push(...this.blockCode(documentText));
		}

		if (config.get<boolean>('simpleURI', true)) {
			allDecorations.push(...this.simpleURI(documentText));
		}

		if (config.get<boolean>('headings', true)) {
			allDecorations.push(...this.headings(documentText));
		}

		if (config.get<boolean>('horizontalLine', true)) {
			allDecorations.push(...this.horizontalLine(documentText));
		}

		if (config.get<boolean>('aliasedURIs', false)) {
			const aliasedURIResult = this.aliasedURI(documentText);
			allDecorations.push(...aliasedURIResult.decorations);
			allLinks.push(...aliasedURIResult.linkData);
		}

		if (config.get<boolean>('referenceURIs', true)) {
			const hideReferenceURIFully = config.get<boolean>('referenceURIsFully', true);
			const referenceURIResult = this.referenceURI(documentText, hideReferenceURIFully);
			allDecorations.push(...referenceURIResult.decorations);
			allLinks.push(...referenceURIResult.linkData);
		}

		// Apply decorations, skipping those in selected lines or inside code blocks
		const decorationMap = new Map<TextEditorDecorationType, Range[]>();

		// Code decorations are only filtered by selection, not by code block containment
		codeDecorations.forEach((decoration) => {
			if (!this.isLineOfRangeSelected(decoration.parent)) {
				const existing = decorationMap.get(decoration.type) || [];
				existing.push(decoration.range);
				decorationMap.set(decoration.type, existing);
			}
		});

		// All other decorations are also filtered by code block containment
		allDecorations.forEach((decoration) => {
			if (!this.isLineOfRangeSelected(decoration.parent) && !Decorator.isInsideCodeBlock(decoration.parent, codeBlockRanges)) {
				const existing = decorationMap.get(decoration.type) || [];
				existing.push(decoration.range);
				decorationMap.set(decoration.type, existing);
			}
		});

		if (this.linkProvider) {
			const filteredLinks = allLinks.filter((link) => !this.isLineOfRangeSelected(link.range) && !Decorator.isInsideCodeBlock(link.range, codeBlockRanges));
			this.linkProvider.links = filteredLinks;
			this.linkProvider.triggerUpdate();
		}

		decorationMap.forEach((ranges, decorationType) => {
			this.activeEditor!.setDecorations(decorationType, ranges);
		});
	}

	/**
   * Bold: **text** or __text__
   * Hides the ** or __ symbols, applies default color to content
   */
	bold(documentText: string): Decoration[] {
		const hideRanges = this.getSymmetricHideRanges(documentText, BOLD_REGEX);
		const colorRanges = this.getFullMatchRanges(documentText, BOLD_REGEX);

		return [
			...hideRanges.map(({range, parent}) => ({range, parent, type: this.hideDecorationType})),
			...colorRanges.map(({range, parent}) => ({range, parent, type: this.defaultColorDecorationType})),
		];
	}

	/**
   * Italic: *text* or _text_
   * Hides the * or _ symbols, applies default color to content
   */
	italic(documentText: string): Decoration[] {
		const hideRanges = this.getSymmetricHideRanges(documentText, ITALIC_REGEX);
		const colorRanges = this.getFullMatchRanges(documentText, ITALIC_REGEX);

		return [
			...hideRanges.map(({range, parent}) => ({range, parent, type: this.hideDecorationType})),
			...colorRanges.map(({range, parent}) => ({range, parent, type: this.defaultColorDecorationType})),
		];
	}

	/**
   * Strikethrough: ~~text~~
   * Hides the ~~ symbols
   */
	strikethrough(documentText: string): Decoration[] {
		return this.getSymmetricHideRanges(documentText, STRIKETHROUGH_REGEX)
			.map(({range, parent}) => ({range, parent, type: this.hideDecorationType}));
	}

	/**
   * Inline code: `code`
   * Hides the ` symbols
   */
	inlineCode(documentText: string): Decoration[] {
		return this.getSymmetricHideRanges(documentText, INLINE_CODE_REGEX)
			.map(({range, parent}) => ({range, parent, type: this.hideDecorationType}));
	}

	/**
   * Block code: ```language\n...\n```
   * Hides the ``` symbols
   */
	blockCode(documentText: string): Decoration[] {
		return this.getSymmetricHideRanges(documentText, BLOCK_CODE_REGEX)
			.map(({range, parent}) => ({range, parent, type: this.hideDecorationType}));
	}

	/**
   * Simple URI: <url>
   * Hides the < and > symbols
   */
	simpleURI(documentText: string): Decoration[] {
		return this.getSymmetricHideRanges(documentText, SIMPLE_URI_REGEX)
			.map(({range, parent}) => ({range, parent, type: this.hideDecorationType}));
	}

	/**
   * Aliased URI: [text](url)
   * Hides [, ](, url, and ), styles the link text
   */
	aliasedURI(documentText: string): {decorations: Decoration[]; linkData: LinkData[]} {
		if (!this.activeEditor) {
			return {decorations: [], linkData: []};
		}

		const decorations: Decoration[] = [];
		const linkData: LinkData[] = [];
		let match;

		while ((match = ALIASED_URI_REGEX.exec(documentText))) {
			// Groups: [0] = full match, [1] = '[', [2] = link text, [3] = '](', [4] = URL, [5] = ')'
			const openBracket = match[1] || '';
			const linkText = match[2] || '';
			const url = match[4] || '';

			const openBracketStart = match.index;
			const linkTextStart = openBracketStart + openBracket.length;
			const middlePartStart = linkTextStart + linkText.length;
			const parent = this.range(match.index, match.index + match[0].length);

			decorations.push(
				{range: this.range(openBracketStart, linkTextStart), parent, type: this.hideDecorationType},
				{range: this.range(middlePartStart, match.index + match[0].length), parent, type: this.hideDecorationType},
			);

			const linkRange = this.range(linkTextStart, middlePartStart);
			decorations.push({range: linkRange, parent, type: this.URIDecorationType});
			linkData.push({range: linkRange, target: url});
		}

		return {
			decorations,
			linkData,
		};
	}

	/**
   * Reference URI: [text][ref]
   * Hides brackets, optionally hides [ref] part, styles the link text
   */
	referenceURI(documentText: string, hideFully: boolean): {decorations: Decoration[]; linkData: LinkData[]} {
		if (!this.activeEditor) {
			return {decorations: [], linkData: []};
		}

		const decorations: Decoration[] = [];
		const linkData: LinkData[] = [];
		let match;

		while ((match = REFERENCE_URI_REGEX.exec(documentText))) {
			// Groups: [0] = full match, [1] = '[', [2] = link text, [3] = ']', [4] = space (optional), [5] = '[', [6] = ref id, [7] = ']'
			const openBracket = match[1] || '';
			const linkText = match[2] || '';
			const closeBracket = match[3] || '';
			const existingSpace = match[4] || '';

			const linkTextStart = match.index + openBracket.length;
			const linkTextEnd = linkTextStart + linkText.length;
			const parent = this.range(match.index, match.index + match[0].length);

			const openLinkBracketRange = this.range(match.index, linkTextStart);
			const linkTextRange = this.range(linkTextStart, linkTextEnd);
			const closeLinkBracketRange = this.range(linkTextEnd, linkTextEnd + closeBracket.length);
			const refPartRange = this.range(linkTextEnd + closeBracket.length, match.index + match[0].length);

			if (hideFully) {
				decorations.push(
					{range: openLinkBracketRange, parent, type: this.hideDecorationType},
					{range: closeLinkBracketRange, parent, type: this.hideDecorationType},
					{range: refPartRange, parent, type: this.hideDecorationType},
				);
				decorations.push({range: linkTextRange, parent, type: this.URIDecorationType});
			} else {
				decorations.push(
					{range: openLinkBracketRange, parent, type: this.hideDecorationType},
					{range: closeLinkBracketRange, parent, type: this.hideDecorationType},
				);
				decorations.push({range: linkTextRange, parent, type: this.URIDecorationType});
				decorations.push({range: refPartRange, parent, type: this.defaultColorDecorationType});
				if (!existingSpace) {
					decorations.push({range: linkTextRange, parent, type: this.spaceAfterDecorationType});
				}
			}
		}

		return {
			decorations,
			linkData,
		};
	}

	/**
   * Headings: # text, ## text, ### text
   * Hides the # symbols, applies default color and size decorations
   */
	headings(documentText: string): Decoration[] {
		if (!this.activeEditor) {
			return [];
		}

		const hideRanges: {range: Range; parent: Range}[] = [];
		let match;

		while ((match = ALL_HEADINGS_REGEX.exec(documentText))) {
			const group = match[0];
			const prefixLength = (/^[ \t]*#{1,6}([ \t]|$)/.exec(group))?.[0]?.length ?? 0;
			if (prefixLength === 0) {
				continue;
			}

			const parent = this.range(match.index, match.index + group.length);
			hideRanges.push({range: this.range(match.index, match.index + prefixLength), parent});
		}

		const colorRanges = this.getFullMatchRanges(documentText, ALL_HEADINGS_REGEX);
		const h1Ranges = this.getFullMatchRanges(documentText, H1_REGEX);
		const h2Ranges = this.getFullMatchRanges(documentText, H2_REGEX);
		const h3Ranges = this.getFullMatchRanges(documentText, H3_REGEX);

		return [
			...hideRanges.map(({range, parent}) => ({range, parent, type: this.hideDecorationType})),
			...colorRanges.map(({range, parent}) => ({range, parent, type: this.defaultColorDecorationType})),
			...h1Ranges.map(({range, parent}) => ({range, parent, type: this.xxlTextDecorationType})),
			...h2Ranges.map(({range, parent}) => ({range, parent, type: this.xlTextDecorationType})),
			...h3Ranges.map(({range, parent}) => ({range, parent, type: this.lTextDecorationType})),
		];
	}

	/**
   * Horizontal lines: ---, ***, ___
   * Hides the characters and draws a horizontal line
   */
	horizontalLine(documentText: string): Decoration[] {
		if (!this.activeEditor) {
			return [];
		}

		const decorations: Decoration[] = [];
		let match;

		while ((match = HORIZONTAL_LINE_REGEX.exec(documentText))) {
			// Regex matches: (\r?\n)[ \t]*(\r?\n)([ \t]*)(-{3,}|\*{3,}|_{3,})([ \t]*)(\r?\n)[ \t]*(\r?\n)
			// match[0] = full match including blank lines before and after
			// match[1] = leading spaces/tabs on the horizontal line
			// match[2] = the horizontal line characters (---, ***, or ___)
			// match[3] = trailing spaces/tabs on the horizontal line
			const fullMatch = match[0];
			const leadingSpace = match[1] || '';
			const lineChars = match[2] || '';
			const trailingSpace = match[3] || '';

			// Find where the horizontal line content actually starts
			// Skip the leading blank line (\n\n or \r\n\r\n)
			const lineContentStart = fullMatch.lastIndexOf(leadingSpace + lineChars);
			const lineStart = match.index + lineContentStart;
			const lineEnd = lineStart + leadingSpace.length + lineChars.length + trailingSpace.length;

			const parent = this.range(lineStart, lineEnd);
			decorations.push({range: parent, parent, type: this.horizontalLineDecorationType});
		}

		return decorations;
	}

	// ============================================================================
	// Helper Functions
	// ============================================================================

	isLineOfRangeSelected(range: Range): boolean {
		return Boolean(this.activeEditor?.selections.find((s) => !(range.end.line < s.start.line || range.start.line > s.end.line)));
	}

	/**
	 * Returns the ranges of all fenced code blocks and inline code spans,
	 * so other decorations can be excluded from these regions.
	 */
	getCodeBlockRanges(documentText: string): Range[] {
		const ranges: Range[] = [];
		let match;

		const blockRegex = new RegExp(BLOCK_CODE_REGEX.source, BLOCK_CODE_REGEX.flags);
		while ((match = blockRegex.exec(documentText))) {
			ranges.push(this.range(match.index, match.index + match[0].length));
		}

		const inlineRegex = new RegExp(INLINE_CODE_REGEX.source, INLINE_CODE_REGEX.flags);
		while ((match = inlineRegex.exec(documentText))) {
			ranges.push(this.range(match.index, match.index + match[0].length));
		}

		return ranges;
	}

	/**
   * Gets hide ranges for symmetric markdown syntax (e.g., **bold**, *italic*, ~~strike~~)
   * Returns opening and closing symbol ranges along with their parent ranges
   */
	getSymmetricHideRanges(documentText: string, regex: RegExp): {range: Range; parent: Range}[] {
		if (!this.activeEditor) {
			return [];
		}

		const results: {range: Range; parent: Range}[] = [];
		let match;

		while ((match = regex.exec(documentText))) {
			// Groups: [0] = full match, [1] = starting symbols, [2,i-1] = content, [i] = ending symbols
			const group = match[0];
			const startGroup = match[1] || [];
			const endGroup = match[match.length - 1] || [];

			const parent = this.range(match.index, match.index + group.length);

			results.push(
				{range: this.range(match.index, match.index + startGroup.length), parent},
				{range: this.range(match.index + group.length - endGroup.length, match.index + group.length), parent},
			);
		}

		return results;
	}

	/**
   * Gets ranges for full regex matches (used for color/size decorations)
   */
	getFullMatchRanges(documentText: string, regex: RegExp): {range: Range; parent: Range}[] {
		if (!this.activeEditor) {
			return [];
		}

		const results: {range: Range; parent: Range}[] = [];
		let match;

		while ((match = regex.exec(documentText))) {
			const group = match[0];
			const fullRange = this.range(match.index, match.index + group.length);
			results.push({range: fullRange, parent: fullRange});
		}

		return results;
	}

	/**
   * Creates a VS Code Range from character offsets in the current document.
   * @param start - The zero-based character offset for the start of the range
   * @param end - The zero-based character offset for the end of the range
   * @returns A Range object spanning from start to end
   *
   * @remarks Assumes an active editor is present (this.activeEditor is defined).
   */
	range(start: number, end: number): Range {
		return new Range(
			this.activeEditor!.document.positionAt(start),
			this.activeEditor!.document.positionAt(end),
		);
	}
}
