import { Range, TextEditor } from 'vscode';
import { DefaultColorDecorationType, HideDecorationType, XxlTextDecorationType, XlTextDecorationType, LTextDecorationType } from './decorations';

const boldRegex = /\*{2}((?=[^\s\*]).*?[^\s\*])\*{2}/g;
const italicRegex = /(?<!\*)\*((?=[^\s\*]).*?[^\s\*])\*(?!\*)/g;
const hRegex = /^[ \t]*#{1,6}([ \t].*|$)/gm;
const h1Regex = /^[ \t]*#{1}([ \t].*|$)/gm;
const h2Regex = /^[ \t]*#{2}([ \t].*|$)/gm;
const h3Regex = /^[ \t]*#{3}([ \t].*|$)/gm;

export class Decorator {
  activeEditor: TextEditor | undefined;
  hideDecorationType = HideDecorationType();
  defaultColorDecorationType = DefaultColorDecorationType();
  xxlTextDecorationType = XxlTextDecorationType();
  xlTextDecorationType = XlTextDecorationType();
  lTextDecorationType = LTextDecorationType();

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

    const hiddenRanges = [];
    hiddenRanges.push(...this.getTogglableSymmetricRanges(documentText, boldRegex, 2))
    hiddenRanges.push(...this.getTogglableSymmetricRanges(documentText, italicRegex, 1))
    hiddenRanges.push(...this.getHeadingHidingRanges(documentText))
    this.activeEditor.setDecorations(this.hideDecorationType, hiddenRanges);

    const defaultColorRanges = []
    defaultColorRanges.push(...this.getRanges(documentText, boldRegex))
    defaultColorRanges.push(...this.getRanges(documentText, italicRegex))
    defaultColorRanges.push(...this.getRanges(documentText, hRegex))
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

  getTogglableSymmetricRanges(documentText: string, regex: RegExp, length: number): Range[] {
    if (!this.activeEditor) return [];
    
    let match;
    const ranges = []
    while ((match = regex.exec(documentText))) {
      const group = match[0];

      const openingStartPosition = this.activeEditor.document.positionAt(match.index);
      const openingEndPosition = this.activeEditor.document.positionAt(match.index + length);
      const closingStartPosition = this.activeEditor.document.positionAt(match.index + group.length - length);
      const closingEndPosition = this.activeEditor.document.positionAt(match.index + group.length);
      const fullRange = new Range(openingStartPosition, closingEndPosition);
      if (this.isLineOfRangeSelected(fullRange)) { // or this.isRangeSelected(range)?
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
    const ranges = []
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

  getRanges(documentText: string, regex: RegExp) {
    if (!this.activeEditor) return [];
    
    let match;
    const ranges = []
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
