import * as vscode from 'vscode';

export class EditorHelper {

	private _start = 0;
	private _end = 0;
	private _range: vscode.DecorationOptions = { range: new vscode.Range(0, 0, 0, 0) };
	private _expression: vscode.DecorationOptions[] = [];

	private evaluatedExpressionDecoration = vscode.window.createTextEditorDecorationType({
		borderWidth: '1px',
		borderStyle: 'solid',
		backgroundColor: 'blue',
	});

	public renderCodeInfo( _currentLine: number) {
		this.clearEditor();
		this.highlightWord(this.evaluatedExpressionDecoration, _currentLine);
	}

	public clearEditor() {
		let editor = vscode.window.activeTextEditor;
		this._expression = []
		if (editor) {
			editor.setDecorations(this.evaluatedExpressionDecoration, this._expression);
		}
	}

	public updateRange(start: number, end: number) {
		this._start = start;
		this._end = end;
	}

	private highlightWord(decorationStyle: vscode.TextEditorDecorationType, _currentLine: number) {
		let editor = vscode.window.activeTextEditor;
		if (editor) {
			if (this._end > this._start) {
				this._range = { range: new vscode.Range(_currentLine, this._start, _currentLine, this._end) };
				this._expression.push(this._range)
				editor.setDecorations(decorationStyle, this._expression)
			}
		}
	}
}