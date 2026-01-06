import {
  Range, TextEditor, workspace, TextEditorDecorationType,
} from 'vscode';
import {
  DefaultColorDecorationType, HideDecorationType, XxlTextDecorationType, XlTextDecorationType, LTextDecorationType, URIDecorationType,
} from './decorations';
import { LinkData, MarkdownDocumentLinkProvider } from './documentLinkProvider';

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
const SIMPLE_URI_REGEX = /(<)((?=[^\s<>]).*?[^\s<>])(>)/g;
const ALIASED_URI_REGEX = /(\[)([^\]]+)(\]\()([^\s)]+)(\))/g;
const REFERENCE_URI_REGEX = /(\[)([^\]]+)(\])(\[)([^\]]+)(\])/g;
const ALL_HEADINGS_REGEX = /^[ \t]*#{1,6}([ \t].*|$)/gm;
const H1_REGEX = /^[ \t]*#{1}([ \t].*|$)/gm;
const H2_REGEX = /^[ \t]*#{2}([ \t].*|$)/gm;
const H3_REGEX = /^[ \t]*#{3}([ \t].*|$)/gm;

export class Decorator {
  activeEditor: TextEditor | undefined;

  linkProvider: MarkdownDocumentLinkProvider | undefined;

  hideDecorationType = HideDecorationType();

  defaultColorDecorationType = DefaultColorDecorationType();

  xxlTextDecorationType = XxlTextDecorationType();

  xlTextDecorationType = XlTextDecorationType();

  lTextDecorationType = LTextDecorationType();

  URIDecorationType = URIDecorationType();

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

    const allDecorations: Decoration[] = [];
    const allLinks: LinkData[] = [];

    allDecorations.push(...this.bold(documentText));
    allDecorations.push(...this.italic(documentText));
    allDecorations.push(...this.strikethrough(documentText));
    allDecorations.push(...this.inlineCode(documentText));
    allDecorations.push(...this.blockCode(documentText));
    allDecorations.push(...this.simpleURI(documentText));
    allDecorations.push(...this.headings(documentText));

    const hideAliasedURIs = config.get<boolean>('hideAliasedURIs', false);
    if (hideAliasedURIs) {
      const aliasedURIResult = this.aliasedURI(documentText);
      allDecorations.push(...aliasedURIResult.decorations);
      allLinks.push(...aliasedURIResult.linkData);
    }

    const hideReferenceURIFully = config.get<boolean>('hideReferenceURIFully', false);
    const referenceURIResult = this.referenceURI(documentText, hideReferenceURIFully);
    allDecorations.push(...referenceURIResult.decorations);
    allLinks.push(...referenceURIResult.linkData);

    const decorationMap = new Map<TextEditorDecorationType, Range[]>();
    allDecorations.forEach((decoration) => {
      if (!this.isLineOfRangeSelected(decoration.parent)) {
        const existing = decorationMap.get(decoration.type) || [];
        existing.push(decoration.range);
        decorationMap.set(decoration.type, existing);
      }
    });

    if (this.linkProvider) {
      const filteredLinks = allLinks.filter((link) => !this.isLineOfRangeSelected(link.parent));
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
      ...hideRanges.map(({ range, parent }) => ({ range, parent, type: this.hideDecorationType })),
      ...colorRanges.map(({ range, parent }) => ({ range, parent, type: this.defaultColorDecorationType })),
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
      ...hideRanges.map(({ range, parent }) => ({ range, parent, type: this.hideDecorationType })),
      ...colorRanges.map(({ range, parent }) => ({ range, parent, type: this.defaultColorDecorationType })),
    ];
  }

  /**
   * Strikethrough: ~~text~~
   * Hides the ~~ symbols
   */
  strikethrough(documentText: string): Decoration[] {
    return this.getSymmetricHideRanges(documentText, STRIKETHROUGH_REGEX)
      .map(({ range, parent }) => ({ range, parent, type: this.hideDecorationType }));
  }

  /**
   * Inline code: `code`
   * Hides the ` symbols
   */
  inlineCode(documentText: string): Decoration[] {
    return this.getSymmetricHideRanges(documentText, INLINE_CODE_REGEX)
      .map(({ range, parent }) => ({ range, parent, type: this.hideDecorationType }));
  }

  /**
   * Block code: ```language\n...\n```
   * Hides the ``` symbols
   */
  blockCode(documentText: string): Decoration[] {
    return this.getSymmetricHideRanges(documentText, BLOCK_CODE_REGEX)
      .map(({ range, parent }) => ({ range, parent, type: this.hideDecorationType }));
  }

  /**
   * Simple URI: <url>
   * Hides the < and > symbols
   */
  simpleURI(documentText: string): Decoration[] {
    return this.getSymmetricHideRanges(documentText, SIMPLE_URI_REGEX)
      .map(({ range, parent }) => ({ range, parent, type: this.hideDecorationType }));
  }

  /**
   * Aliased URI: [text](url)
   * Hides [, ](, url, and ), styles the link text
   */
  aliasedURI(documentText: string): { decorations: Decoration[]; linkData: LinkData[] } {
    if (!this.activeEditor) return { decorations: [], linkData: [] };

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
        { range: this.range(openBracketStart, linkTextStart), parent, type: this.hideDecorationType },
        { range: this.range(middlePartStart, match.index + match[0].length), parent, type: this.hideDecorationType },
      );

      const linkRange = this.range(linkTextStart, middlePartStart);
      decorations.push({ range: linkRange, parent, type: this.URIDecorationType });
      linkData.push({ range: linkRange, target: url });
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
  referenceURI(documentText: string, hideFully: boolean): { decorations: Decoration[]; linkData: LinkData[] } {
    if (!this.activeEditor) return { decorations: [], linkData: [] };

    const decorations: Decoration[] = [];
    const linkData: LinkData[] = [];
    let match;

    while ((match = REFERENCE_URI_REGEX.exec(documentText))) {
      // Groups: [0] = full match, [1] = '[', [2] = link text, [3] = ']', [4] = '[', [5] = ref id, [6] = ']'
      const openBracket = match[1] || '';
      const linkText = match[2] || '';
      const closeBracket = match[3] || '';

      const linkTextStart = match.index + openBracket.length;
      const linkTextEnd = linkTextStart + linkText.length;
      const parent = this.range(match.index, match.index + match[0].length);

      const openLinkBracketRange = this.range(match.index, linkTextStart);
      const linkTextRange = this.range(linkTextStart, linkTextEnd);
      const closeLinkBracketRange = this.range(linkTextEnd, linkTextEnd + closeBracket.length);
      const refPartRange = this.range(linkTextEnd + closeBracket.length, match.index + match[0].length);

      if (hideFully) {
        decorations.push(
          { range: openLinkBracketRange, parent, type: this.hideDecorationType },
          { range: closeLinkBracketRange, parent, type: this.hideDecorationType },
          { range: refPartRange, parent, type: this.hideDecorationType },
        );
        decorations.push({ range: linkTextRange, parent, type: this.URIDecorationType });
      } else {
        decorations.push(
          { range: openLinkBracketRange, parent, type: this.hideDecorationType },
          { range: closeLinkBracketRange, parent, type: this.hideDecorationType },
        );
        decorations.push({ range: linkTextRange, parent, type: this.URIDecorationType });
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
    if (!this.activeEditor) return [];

    const hideRanges: Array<{ range: Range; parent: Range }> = [];
    let match;

    while ((match = ALL_HEADINGS_REGEX.exec(documentText))) {
      const group = match[0];
      const prefixLength = group.match(/^[ \t]*#{1,6}([ \t]|$)/)?.[0]?.length ?? 0;
      if (prefixLength === 0) {
        continue;
      }

      const parent = this.range(match.index, match.index + group.length);
      hideRanges.push({ range: this.range(match.index, match.index + prefixLength), parent });
    }

    const colorRanges = this.getFullMatchRanges(documentText, ALL_HEADINGS_REGEX);
    const h1Ranges = this.getFullMatchRanges(documentText, H1_REGEX);
    const h2Ranges = this.getFullMatchRanges(documentText, H2_REGEX);
    const h3Ranges = this.getFullMatchRanges(documentText, H3_REGEX);

    return [
      ...hideRanges.map(({ range, parent }) => ({ range, parent, type: this.hideDecorationType })),
      ...colorRanges.map(({ range, parent }) => ({ range, parent, type: this.defaultColorDecorationType })),
      ...h1Ranges.map(({ range, parent }) => ({ range, parent, type: this.xxlTextDecorationType })),
      ...h2Ranges.map(({ range, parent }) => ({ range, parent, type: this.xlTextDecorationType })),
      ...h3Ranges.map(({ range, parent }) => ({ range, parent, type: this.lTextDecorationType })),
    ];
  }

  // ============================================================================
  // Helper Functions
  // ============================================================================

  isLineOfRangeSelected(range: Range): boolean {
    return !!(this.activeEditor?.selections.find((s) => !(range.end.line < s.start.line || range.start.line > s.end.line)));
  }

  /**
   * Gets hide ranges for symmetric markdown syntax (e.g., **bold**, *italic*, ~~strike~~)
   * Returns opening and closing symbol ranges along with their parent ranges
   */
  getSymmetricHideRanges(documentText: string, regex: RegExp): Array<{ range: Range; parent: Range }> {
    if (!this.activeEditor) return [];

    const results: Array<{ range: Range; parent: Range }> = [];
    let match;

    while ((match = regex.exec(documentText))) {
      // Groups: [0] = full match, [1] = starting symbols, [2,i-1] = content, [i] = ending symbols
      const group = match[0];
      const startGroup = match[1] || [];
      const endGroup = match[match.length - 1] || [];

      const parent = this.range(match.index, match.index + group.length);

      results.push(
        { range: this.range(match.index, match.index + startGroup.length), parent },
        { range: this.range(match.index + group.length - endGroup.length, match.index + group.length), parent },
      );
    }

    return results;
  }

  /**
   * Gets ranges for full regex matches (used for color/size decorations)
   */
  getFullMatchRanges(documentText: string, regex: RegExp): Array<{ range: Range; parent: Range }> {
    if (!this.activeEditor) return [];

    const results: Array<{ range: Range; parent: Range }> = [];
    let match;

    while ((match = regex.exec(documentText))) {
      const group = match[0];
      const fullRange = this.range(match.index, match.index + group.length);
      results.push({ range: fullRange, parent: fullRange });
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
