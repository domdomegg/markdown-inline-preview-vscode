import { Range, TextEditor, workspace } from 'vscode';
import {
  DefaultColorDecorationType, HideDecorationType, XxlTextDecorationType, XlTextDecorationType, LTextDecorationType, URIDecorationType,
} from './decorations';
import { MarkdownDocumentLinkProvider } from './documentLinkProvider';

const boldRegex = /(\*{2}|_{2})((?=[^\s*_]).*?[^\s*_])(\1)/g;
const italicRegex = /(?<!\*|_)(\*|_)((?=[^\s*_]).*?[^\s*_])(\1)(?!\*|_)/g;
const strikethroughRegex = /(?<!~)(~{2})((?=[^\s~]).*?[^\s~])(~{2})(?!~)/g;
const inlineCodeRegex = /(`)((?=[^\s`]).*?[^\s`])(`)/g;
const blockCodeRegex = /((`{3}|~{3})\w*\n)(.*\n)*?(\2\n)/g;
const simpleURIRegex = /(<)((?=[^\s<>]).*?[^\s<>])(>)/g;
const aliasedURIRegex = /(\[)([^\]]+)(\]\()([^\s)]+)(\))/g;
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
    const hideAliasedURIs = config.get<boolean>('hideAliasedURIs', false);

    const aliasedURIRanges = this.getAliasedURIRanges(documentText);
    if (hideAliasedURIs) {
      if (this.linkProvider) {
        this.linkProvider.aliasedURIData = aliasedURIRanges.linkData;
        this.linkProvider.triggerUpdate();
      }
      const linkRanges = aliasedURIRanges.linkData.map((link) => link.range);
      this.activeEditor.setDecorations(this.URIDecorationType, linkRanges);
      this.activeEditor.setDecorations(this.hideDecorationType, aliasedURIRanges.hideRanges);
    }

    const hiddenRanges = [];
    hiddenRanges.push(...this.getTogglableSymmetricRanges(documentText, boldRegex));
    hiddenRanges.push(...this.getTogglableSymmetricRanges(documentText, italicRegex));
    hiddenRanges.push(...this.getTogglableSymmetricRanges(documentText, strikethroughRegex));
    hiddenRanges.push(...this.getTogglableSymmetricRanges(documentText, inlineCodeRegex));
    hiddenRanges.push(...this.getTogglableSymmetricRanges(documentText, blockCodeRegex));
    hiddenRanges.push(...this.getTogglableSymmetricRanges(documentText, simpleURIRegex));
    hiddenRanges.push(...this.getHeadingHidingRanges(documentText));
    this.activeEditor.setDecorations(this.hideDecorationType, hiddenRanges);

    const defaultColorRanges = [];
    defaultColorRanges.push(...this.getRanges(documentText, boldRegex));
    defaultColorRanges.push(...this.getRanges(documentText, italicRegex));
    defaultColorRanges.push(...this.getRanges(documentText, hRegex));
    this.activeEditor.setDecorations(this.defaultColorDecorationType, defaultColorRanges);

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
      const group = match[0];

      const startGroup = match[1] || [];
      const endGroup = match[match.length - 1] || [];

      const openingStartPosition = this.activeEditor.document.positionAt(match.index);
      const openingEndPosition = this.activeEditor.document.positionAt(match.index + startGroup.length);
      const closingStartPosition = this.activeEditor.document.positionAt(match.index + group.length - endGroup.length);
      const closingEndPosition = this.activeEditor.document.positionAt(match.index + group.length);
      const fullRange = new Range(openingStartPosition, closingEndPosition);
      if (this.isLineOfRangeSelected(fullRange)) {
        continue;
      }
      ranges.push(
        new Range(openingStartPosition, openingEndPosition),
        new Range(closingStartPosition, closingEndPosition),
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

      const startPosition = this.activeEditor.document.positionAt(match.index);
      const endOfPrefixPosition = this.activeEditor.document.positionAt(match.index + prefixLength);
      const endPosition = this.activeEditor.document.positionAt(match.index + group.length);
      const fullRange = new Range(startPosition, endPosition);
      if (this.isLineOfRangeSelected(fullRange)) { // or this.isRangeSelected(range)?
        continue;
      }
      ranges.push(
        new Range(startPosition, endOfPrefixPosition),
      );
    }
    return ranges;
  }

  getAliasedURIRanges(documentText: string) {
    if (!this.activeEditor) return { hideRanges: [], linkData: [] };

    let match;
    const hideRanges = [];
    const linkData = [];

    while ((match = aliasedURIRegex.exec(documentText))) {
      // Groups: [0] = full match, [1] = '[', [2] = link text, [3] = '](', [4] = URL, [5] = ')'
      const openBracket = match[1] || '';
      const linkText = match[2] || '';
      const url = match[4] || '';

      const fullRange = new Range(
        this.activeEditor.document.positionAt(match.index),
        this.activeEditor.document.positionAt(match.index + match[0].length),
      );

      if (this.isLineOfRangeSelected(fullRange)) {
        continue;
      }

      // Hide '[', '](', URI, and ')'
      const openBracketStart = match.index;
      const linkTextStart = openBracketStart + openBracket.length;
      const middlePartStart = linkTextStart + linkText.length; // This is where '](' starts

      hideRanges.push(
        new Range(
          this.activeEditor.document.positionAt(openBracketStart),
          this.activeEditor.document.positionAt(linkTextStart),
        ),
        new Range(
          this.activeEditor.document.positionAt(middlePartStart),
          this.activeEditor.document.positionAt(match.index + match[0].length),
        ),
      );

      // Store link data for the DocumentLinkProvider
      linkData.push({
        range: new Range(
          this.activeEditor.document.positionAt(linkTextStart),
          this.activeEditor.document.positionAt(middlePartStart),
        ),
        target: url,
      });
    }

    return { hideRanges, linkData };
  }

  getRanges(documentText: string, regex: RegExp) {
    if (!this.activeEditor) return [];

    let match;
    const ranges = [];
    while ((match = regex.exec(documentText))) {
      const group = match[0];

      const startPosition = this.activeEditor.document.positionAt(match.index);
      const endPosition = this.activeEditor.document.positionAt(match.index + group.length);
      ranges.push(
        new Range(startPosition, endPosition),
      );
    }
    return ranges;
  }
}
