import * as vscode from 'vscode';
import { Decorator } from './decorator';
import { MarkdownDocumentLinkProvider } from './documentLinkProvider';

export function activate(context: vscode.ExtensionContext) {
  const linkProviderInstance = new MarkdownDocumentLinkProvider();
  const decorator = new Decorator();
  decorator.setLinkProvider(linkProviderInstance);
  decorator.setActiveEditor(vscode.window.activeTextEditor);

  const changeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor(() => {
    decorator.setActiveEditor(vscode.window.activeTextEditor);
  });

  const changeTextEditorSelection = vscode.window.onDidChangeTextEditorSelection(() => {
    decorator.updateDecorations();
  });

  const linkProvider = vscode.languages.registerDocumentLinkProvider(
    [{ language: 'markdown' }, { language: 'mdx' }],
    linkProviderInstance,
  );

  context.subscriptions.push(changeActiveTextEditor);
  context.subscriptions.push(changeTextEditorSelection);
  context.subscriptions.push(linkProvider);
}

export function deactivate(context: vscode.ExtensionContext) {
  context.subscriptions.forEach((subscription) => subscription.dispose());
}
