import { ThemeColor, window } from 'vscode';

export function HideDecorationType() {
  return window.createTextEditorDecorationType({
    // Hide the item
    textDecoration: 'none; display: none;',

    // This forces the editor to re-layout following text correctly
    after: {
      contentText: '',
    },
  });
}

export function DefaultColorDecorationType() {
  return window.createTextEditorDecorationType({
    color: new ThemeColor('editor.foreground'),
  });
}

export function XxlTextDecorationType() {
  return window.createTextEditorDecorationType({
    textDecoration: 'none; font-size: 200%;',
  });
}

export function XlTextDecorationType() {
  return window.createTextEditorDecorationType({
    textDecoration: 'none; font-size: 150%;',
  });
}

export function LTextDecorationType() {
  return window.createTextEditorDecorationType({
    textDecoration: 'none; font-size: 110%;',
  });
}

export function URIDecorationType() {
  return window.createTextEditorDecorationType({
    textDecoration: 'none; border-bottom: 1px solid currentColor',
    color: new ThemeColor('editor.foreground'),
    cursor: 'pointer',
  });
}
