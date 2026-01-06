import {
  Range, TextEditor, workspace, TextEditorDecorationType,
} from 'vscode';
import {
  DefaultColorDecorationType, HideDecorationType, XxlTextDecorationType, XlTextDecorationType, LTextDecorationType, URIDecorationType,
} from './decorations';
import { LinkData, MarkdownDocumentLinkProvider } from './documentLinkProvider';

type Decoration = {
  ranges: Range[];
  decorationType: TextEditorDecorationType;
};

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

    allDecorations.push(...this.headings(documentText));

    if (this.linkProvider) {
      this.linkProvider.links = allLinks;
      this.linkProvider.triggerUpdate();
    }

    // Bundle decorations by type (for speed?)
    const decorationMap = new Map<TextEditorDecorationType, Range[]>();
    allDecorations.forEach((decoration) => {
      const existing = decorationMap.get(decoration.decorationType) || [];
      existing.push(...decoration.ranges);
      decorationMap.set(decoration.decorationType, existing);
    });

    decorationMap.forEach((ranges, decorationType) => {
      this.activeEditor!.setDecorations(decorationType, ranges);
    });
  }

  /**
   * Bold: **text** or __text__
   * Hides the ** or __ symbols, applies default color to content
   */
  bold(documentText: string): Decoration[] {
    const regex = /(\*{2}|_{2})((?=[^\s*_]).*?[^\s*_])(\1)/g;
    const hideRanges = this.getSymmetricHideRanges(documentText, regex);
    const colorRanges = this.getFullMatchRanges(documentText, regex);

    return [
      { ranges: hideRanges, decorationType: this.hideDecorationType },
      { ranges: colorRanges, decorationType: this.defaultColorDecorationType },
    ];
  }

  /**
   * Italic: *text* or _text_
   * Hides the * or _ symbols, applies default color to content
   */
  italic(documentText: string): Decoration[] {
    const regex = /(?<!\*|_)(\*|_)((?=[^\s*_]).*?[^\s*_])(\1)(?!\*|_)/g;
    const hideRanges = this.getSymmetricHideRanges(documentText, regex);
    const colorRanges = this.getFullMatchRanges(documentText, regex);

    return [
      { ranges: hideRanges, decorationType: this.hideDecorationType },
      { ranges: colorRanges, decorationType: this.defaultColorDecorationType },
    ];
  }

  /**
   * Strikethrough: ~~text~~
   * Hides the ~~ symbols
   */
  strikethrough(documentText: string): Decoration[] {
    const regex = /(?<!~)(~{2})((?=[^\s~]).*?[^\s~])(~{2})(?!~)/g;
    const hideRanges = this.getSymmetricHideRanges(documentText, regex);

    return [
      { ranges: hideRanges, decorationType: this.hideDecorationType },
    ];
  }

  /**
   * Inline code: `code`
   * Hides the ` symbols
   */
  inlineCode(documentText: string): Decoration[] {
    const regex = /(`)((?=[^\s`]).*?[^\s`])(`)/g;
    const hideRanges = this.getSymmetricHideRanges(documentText, regex);

    return [
      { ranges: hideRanges, decorationType: this.hideDecorationType },
    ];
  }

  /**
   * Block code: ```language\n...\n```
   * Hides the ``` symbols
   */
  blockCode(documentText: string): Decoration[] {
    const regex = /((`{3}|~{3})\w*\n)(.*\n)*?(\2\n)/g;
    const hideRanges = this.getSymmetricHideRanges(documentText, regex);

    return [
      { ranges: hideRanges, decorationType: this.hideDecorationType },
    ];
  }

  /**
   * Simple URI: <url>
   * Hides the < and > symbols
   */
  simpleURI(documentText: string): Decoration[] {
    const regex = /(<)((?=[^\s<>]).*?[^\s<>])(>)/g;
    const hideRanges = this.getSymmetricHideRanges(documentText, regex);

    return [
      { ranges: hideRanges, decorationType: this.hideDecorationType },
    ];
  }

  /**
   * Aliased URI: [text](url)
   * Hides [, ](, url, and ), styles the link text
   */
  aliasedURI(documentText: string): { decorations: Decoration[]; linkData: LinkData[] } {
    if (!this.activeEditor) return { decorations: [], linkData: [] };

    const regex = /(\[)([^\]]+)(\]\()([^\s)]+)(\))/g;
    const hideRanges: Range[] = [];
    const linkStylingRanges: Range[] = [];
    const linkData: LinkData[] = [];
    let match;

    while ((match = regex.exec(documentText))) {
      // Groups: [0] = full match, [1] = '[', [2] = link text, [3] = '](', [4] = URL, [5] = ')'
      const openBracket = match[1] || '';
      const linkText = match[2] || '';
      const url = match[4] || '';

      const fullRange = this.range(match.index, match.index + match[0].length);
      if (this.isLineOfRangeSelected(fullRange)) {
        continue;
      }

      const openBracketStart = match.index;
      const linkTextStart = openBracketStart + openBracket.length;
      const middlePartStart = linkTextStart + linkText.length;

      hideRanges.push(
        this.range(openBracketStart, linkTextStart),
        this.range(middlePartStart, match.index + match[0].length),
      );

      const linkRange = this.range(linkTextStart, middlePartStart);
      linkStylingRanges.push(linkRange);
      linkData.push({ range: linkRange, target: url });
    }

    return {
      decorations: [
        { ranges: hideRanges, decorationType: this.hideDecorationType },
        { ranges: linkStylingRanges, decorationType: this.URIDecorationType },
      ],
      linkData,
    };
  }

  /**
   * Reference URI: [text][ref]
   * Hides brackets, optionally hides [ref] part, styles the link text
   */
  referenceURI(documentText: string, hideFully: boolean): { decorations: Decoration[]; linkData: LinkData[] } {
    if (!this.activeEditor) return { decorations: [], linkData: [] };

    const regex = /(\[)([^\]]+)(\])(\[)([^\]]+)(\])/g;
    const hideRanges: Range[] = [];
    const linkStylingRanges: Range[] = [];
    const linkData: LinkData[] = [];
    let match;

    while ((match = regex.exec(documentText))) {
      // Groups: [0] = full match, [1] = '[', [2] = link text, [3] = ']', [4] = '[', [5] = ref id, [6] = ']'
      const openBracket = match[1] || '';
      const linkText = match[2] || '';
      const closeBracket = match[3] || '';

      const fullRange = this.range(match.index, match.index + match[0].length);
      if (this.isLineOfRangeSelected(fullRange)) {
        continue;
      }

      const linkTextStart = match.index + openBracket.length;
      const linkTextEnd = linkTextStart + linkText.length;

      const openLinkBracketRange = this.range(match.index, linkTextStart);
      const linkTextRange = this.range(linkTextStart, linkTextEnd);
      const closeLinkBracketRange = this.range(linkTextEnd, linkTextEnd + closeBracket.length);
      const refPartRange = this.range(linkTextEnd + closeBracket.length, match.index + match[0].length);

      if (hideFully) {
        hideRanges.push(openLinkBracketRange, closeLinkBracketRange, refPartRange);
        linkStylingRanges.push(linkTextRange);
      } else {
        hideRanges.push(openLinkBracketRange, closeLinkBracketRange);
        linkStylingRanges.push(linkTextRange);
      }
    }

    return {
      decorations: [
        { ranges: hideRanges, decorationType: this.hideDecorationType },
        { ranges: linkStylingRanges, decorationType: this.URIDecorationType },
      ],
      linkData,
    };
  }

  /**
   * Headings: # text, ## text, ### text
   * Hides the # symbols, applies default color and size decorations
   */
  headings(documentText: string): Decoration[] {
    if (!this.activeEditor) return [];

    const allHeadingsRegex = /^[ \t]*#{1,6}([ \t].*|$)/gm;
    const h1Regex = /^[ \t]*#{1}([ \t].*|$)/gm;
    const h2Regex = /^[ \t]*#{2}([ \t].*|$)/gm;
    const h3Regex = /^[ \t]*#{3}([ \t].*|$)/gm;

    const hideRanges: Range[] = [];
    let match;

    while ((match = allHeadingsRegex.exec(documentText))) {
      const group = match[0];
      const prefixLength = group.match(/^[ \t]*#{1,6}([ \t]|$)/)?.[0]?.length ?? 0;
      if (prefixLength === 0) {
        continue;
      }

      const fullRange = this.range(match.index, match.index + group.length);
      if (this.isLineOfRangeSelected(fullRange)) {
        continue;
      }

      hideRanges.push(this.range(match.index, match.index + prefixLength));
    }

    const colorRanges = this.getFullMatchRanges(documentText, allHeadingsRegex);
    const h1Ranges = this.getFullMatchRanges(documentText, h1Regex);
    const h2Ranges = this.getFullMatchRanges(documentText, h2Regex);
    const h3Ranges = this.getFullMatchRanges(documentText, h3Regex);

    return [
      { ranges: hideRanges, decorationType: this.hideDecorationType },
      { ranges: colorRanges, decorationType: this.defaultColorDecorationType },
      { ranges: h1Ranges, decorationType: this.xxlTextDecorationType },
      { ranges: h2Ranges, decorationType: this.xlTextDecorationType },
      { ranges: h3Ranges, decorationType: this.lTextDecorationType },
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
   * Hides opening and closing symbols unless the line is selected
   */
  getSymmetricHideRanges(documentText: string, regex: RegExp): Range[] {
    if (!this.activeEditor) return [];

    const ranges: Range[] = [];
    let match;

    while ((match = regex.exec(documentText))) {
      // Groups: [0] = full match, [1] = starting symbols, [2,i-1] = content, [i] = ending symbols
      const group = match[0];
      const startGroup = match[1] || [];
      const endGroup = match[match.length - 1] || [];

      const fullRange = this.range(match.index, match.index + group.length);
      if (this.isLineOfRangeSelected(fullRange)) {
        continue;
      }

      ranges.push(
        this.range(match.index, match.index + startGroup.length),
        this.range(match.index + group.length - endGroup.length, match.index + group.length),
      );
    }

    return ranges;
  }

  /**
   * Gets ranges for full regex matches (used for color/size decorations)
   */
  getFullMatchRanges(documentText: string, regex: RegExp): Range[] {
    if (!this.activeEditor) return [];

    const ranges: Range[] = [];
    let match;

    while ((match = regex.exec(documentText))) {
      const group = match[0];
      ranges.push(this.range(match.index, match.index + group.length));
    }

    return ranges;
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
