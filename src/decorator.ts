import { Range, TextEditor, workspace } from 'vscode';
import {
  DefaultColorDecorationType, HideDecorationType, XxlTextDecorationType, XlTextDecorationType, LTextDecorationType, URIDecorationType,
} from './decorations';
import { LinkData, MarkdownDocumentLinkProvider } from './documentLinkProvider';

const boldRegex = /(\*{2}|_{2})((?=[^\s*_]).*?[^\s*_])(\1)/g;
const italicRegex = /(?<!\*|_)(\*|_)((?=[^\s*_]).*?[^\s*_])(\1)(?!\*|_)/g;
const strikethroughRegex = /(?<!~)(~{2})((?=[^\s~]).*?[^\s~])(~{2})(?!~)/g;
const inlineCodeRegex = /(`)((?=[^\s`]).*?[^\s`])(`)/g;
const blockCodeRegex = /((`{3}|~{3})\w*\n)(.*\n)*?(\2\n)/g;
const simpleURIRegex = /(<)((?=[^\s<>]).*?[^\s<>])(>)/g;
const aliasedURIRegex = /(\[)([^\]]+)(\]\()([^\s)]+)(\))/g;
const referenceURIRegex = /(\[)([^\]]+)(\])(\[)([^\]]+)(\])/g;
const hRegex = /^[ \t]*#{1,6}([ \t].*|$)/gm;
const h1Regex = /^[ \t]*#{1}([ \t].*|$)/gm;
const h2Regex = /^[ \t]*#{2}([ \t].*|$)/gm;
const h3Regex = /^[ \t]*#{3}([ \t].*|$)/gm;

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

    // Aliased URIs hiding, color and underlining
    const hideAliasedURIs = config.get<boolean>('hideAliasedURIs', false);
    const aliasedURIRanges = (hideAliasedURIs)
      ? this.getAliasedURIRanges(documentText)
      : { hideRanges: [], linkStylingRanges: [], linkData: [] };
    this.activeEditor.setDecorations(this.hideDecorationType, aliasedURIRanges.hideRanges);
    this.activeEditor.setDecorations(this.URIDecorationType, aliasedURIRanges.linkStylingRanges);

    // Reference URIs hiding, color, and underlining
    const hideReferenceURIFully = config.get<boolean>('hideReferenceURIFully', false);
    const referenceURIRanges = this.getReferenceURIRanges(documentText, hideReferenceURIFully);
    this.activeEditor.setDecorations(this.URIDecorationType, referenceURIRanges.linkStylingRanges);
    this.activeEditor.setDecorations(this.hideDecorationType, referenceURIRanges.hideRanges);

    // Reference & aliased URI connection to DocumentLinkProvider
    if (this.linkProvider) {
      this.linkProvider.links = [...referenceURIRanges.linkData, ...aliasedURIRanges.linkData];
      this.linkProvider.triggerUpdate();
    }

    // Hiding for bold, italic, strikethrough, inline code, block code, simple URIs, headings
    const hiddenRanges = [];
    hiddenRanges.push(...referenceURIRanges.hideRanges);
    hiddenRanges.push(...this.getTogglableSymmetricRanges(documentText, boldRegex));
    hiddenRanges.push(...this.getTogglableSymmetricRanges(documentText, italicRegex));
    hiddenRanges.push(...this.getTogglableSymmetricRanges(documentText, strikethroughRegex));
    hiddenRanges.push(...this.getTogglableSymmetricRanges(documentText, inlineCodeRegex));
    hiddenRanges.push(...this.getTogglableSymmetricRanges(documentText, blockCodeRegex));
    hiddenRanges.push(...this.getTogglableSymmetricRanges(documentText, simpleURIRegex));
    hiddenRanges.push(...this.getHeadingHidingRanges(documentText));
    this.activeEditor.setDecorations(this.hideDecorationType, hiddenRanges);

    // Default color decorations for bold, italic, headings
    const defaultColorRanges = [];
    defaultColorRanges.push(...this.getRanges(documentText, boldRegex));
    defaultColorRanges.push(...this.getRanges(documentText, italicRegex));
    defaultColorRanges.push(...this.getRanges(documentText, hRegex));
    this.activeEditor.setDecorations(this.defaultColorDecorationType, defaultColorRanges);

    // Heading size decorations
    this.activeEditor.setDecorations(this.xxlTextDecorationType, this.getRanges(documentText, h1Regex));
    this.activeEditor.setDecorations(this.xlTextDecorationType, this.getRanges(documentText, h2Regex));
    this.activeEditor.setDecorations(this.lTextDecorationType, this.getRanges(documentText, h3Regex));
  }

  isRangeSelected(range: Range): boolean {
    return !!(this.activeEditor?.selections.find((s) => range.intersection(s)));
  }

  isLineOfRangeSelected(range: Range): boolean {
    return !!(this.activeEditor?.selections.find((s) => !(range.end.line < s.start.line || range.start.line > s.end.line)));
  }

  getTogglableSymmetricRanges(documentText: string, regex: RegExp): Range[] {
    if (!this.activeEditor) return [];

    let match;
    const ranges = [];
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

  getHeadingHidingRanges(documentText: string) {
    if (!this.activeEditor) return [];

    let match;
    const ranges = [];
    while ((match = hRegex.exec(documentText))) {
      const group = match[0];
      const prefixLength = group.match(/^[ \t]*#{1,6}([ \t]|$)/)?.[0]?.length ?? 0;
      if (prefixLength === 0) {
        continue;
      }

      const fullRange = this.range(match.index, match.index + group.length);
      if (this.isLineOfRangeSelected(fullRange)) {
        continue;
      }

      ranges.push(this.range(match.index, match.index + prefixLength));
    }

    return ranges;
  }

  getAliasedURIRanges(documentText: string) {
    if (!this.activeEditor) return { hideRanges: [], linkStylingRanges: [], linkData: [] };

    let match;
    const hideRanges = [];
    const linkStylingRanges = [];
    const linkData: LinkData[] = [];

    while ((match = aliasedURIRegex.exec(documentText))) {
      // Groups: [0] = full match, [1] = '[', [2] = link text, [3] = '](', [4] = URL, [5] = ')'
      const openBracket = match[1] || '';
      const linkText = match[2] || '';
      const url = match[4] || '';

      const fullRange = this.range(match.index, match.index + match[0].length);
      if (this.isLineOfRangeSelected(fullRange)) {
        continue;
      }

      // Hide '[', '](', URI, and ')'
      const openBracketStart = match.index;
      const linkTextStart = openBracketStart + openBracket.length;
      const middlePartStart = linkTextStart + linkText.length; // This is where '](' starts

      hideRanges.push(
        this.range(openBracketStart, linkTextStart),
        this.range(middlePartStart, match.index + match[0].length),
      );

      // Store link data for the DocumentLinkProvider
      const linkRange = this.range(linkTextStart, middlePartStart);
      linkStylingRanges.push(linkRange);
      linkData.push({ range: linkRange, target: url });
    }

    return { hideRanges, linkStylingRanges, linkData };
  }

  getReferenceURIRanges(documentText: string, hideReferenceURIFully: boolean) {
    if (!this.activeEditor) return { hideRanges: [], linkStylingRanges: [], linkData: [] };

    let match;
    const hideRanges = [];
    const linkStylingRanges = [];
    const linkData: LinkData[] = []; // Stays empty for now.

    while ((match = referenceURIRegex.exec(documentText))) {
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

      if (hideReferenceURIFully) {
        // Only display the link text
        hideRanges.push(openLinkBracketRange, closeLinkBracketRange, refPartRange);
        linkStylingRanges.push(linkTextRange);
      } else {
        // Hide the brackets around the link text only
        hideRanges.push(openLinkBracketRange, closeLinkBracketRange);
        linkStylingRanges.push(linkTextRange);
      }
    }

    return { hideRanges, linkStylingRanges, linkData };
  }

  getRanges(documentText: string, regex: RegExp) {
    if (!this.activeEditor) return [];

    let match;
    const ranges = [];
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
