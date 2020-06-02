import * as vscode from 'vscode';

const countLengthOfLineAt = (lineNumber: number, textEditor: vscode.TextEditor): number =>
	textEditor.document.lineAt(lineNumber).range.end.character;

const calculatePosition = (position: vscode.Position, scrollingEditor: vscode.TextEditor, scrolledEditor: vscode.TextEditor): vscode.Position =>
	new vscode.Position(
		position.line,
		~~(position.character / countLengthOfLineAt(position.line, scrollingEditor) * countLengthOfLineAt(position.line, scrolledEditor)),
	);

const calculateRange = (visibleRange: vscode.Range, scrollingEditor: vscode.TextEditor, scrolledEditor: vscode.TextEditor): vscode.Range =>
	new vscode.Range(
		calculatePosition(visibleRange.start, scrollingEditor, scrolledEditor),
		new vscode.Position(visibleRange.start.line + 1, 0),
	);

export function activate(context: vscode.ExtensionContext) {
	let scrollingTask: NodeJS.Timeout;
	let scrollingEditor: vscode.TextEditor;
	const scrolledEditorsQueue: Set<vscode.TextEditor> = new Set();
	context.subscriptions.push(
		vscode.window.onDidChangeTextEditorVisibleRanges(({ textEditor, visibleRanges }) => {
			if (scrollingEditor !== textEditor) {
				if (scrolledEditorsQueue.has(textEditor)) {
					scrolledEditorsQueue.delete(textEditor);
					return;	
				}
				scrollingEditor = textEditor;
			}
			if (scrollingTask) clearTimeout(scrollingTask);
			scrollingTask = setTimeout(() => {
				console.log(textEditor)
				vscode.window.visibleTextEditors
					.filter(editor => editor !== textEditor)
					.forEach(editor => {
						scrolledEditorsQueue.add(editor);
						editor.revealRange(calculateRange(visibleRanges[0], textEditor, editor), vscode.TextEditorRevealType.AtTop)
					})
			}, 100);
		}),
		
	);
}

export function deactivate() {}
