import * as vscode from 'vscode'
import { checkSplitPanels, calculateRange, wholeLine, calculatePosition } from './utils'
import { ModeState, AllStates } from './states'
import { flatMap } from 'lodash';

export function activate(context: vscode.ExtensionContext) {
	let scrollingTask: NodeJS.Timeout
	let scrollingEditor: vscode.TextEditor | null
	let correspondingLinesHighlight: vscode.TextEditorDecorationType | undefined
	const scrolledEditorsQueue: Set<vscode.TextEditor> = new Set()
	const offsetByEditors: Map<vscode.TextEditor, number> = new Map()
	const reset = () => {
		offsetByEditors.clear()
		scrolledEditorsQueue.clear()
		scrollingEditor = null
		clearTimeout(scrollingTask)
		correspondingLinesHighlight?.dispose()
	}

	const modeState = new ModeState(context)

	// Register disposables
	context.subscriptions.push(
		modeState.registerCommand(() => {
			reset()
		}),
		vscode.commands.registerTextEditorCommand('syncScroll.jumpToNextPanelCorrespondingPosition', (textEditor) => {
			const selection = textEditor.selection
			const textEditors = vscode.window.visibleTextEditors
			.filter(editor => editor !== textEditor && editor.document.uri.scheme !== 'output')
			const nextTextEditor = textEditors[(textEditors.indexOf(textEditor) + 1) % textEditors.length]
			const offset = offsetByEditors.get(nextTextEditor)
			const correspondingStartPosition = calculatePosition(
				selection.start,
				offset,
				textEditor,
				nextTextEditor
			)
			const correspondingPosition = new vscode.Range(
				correspondingStartPosition,
				correspondingStartPosition
			)
			const correspondingRange = calculateRange(selection, offset)
			vscode.window.showTextDocument(nextTextEditor.document, {
				viewColumn: nextTextEditor.viewColumn,
				selection: selection.isEmpty ? correspondingPosition : correspondingRange,
			})
		}),
		vscode.commands.registerTextEditorCommand('syncScroll.copyToAllCorrespondingPositions', (textEditor) => {
			const joinedContent = textEditor.selections
				.map((selection) => {
					const range = calculateRange(selection, offsetByEditors.get(textEditor))
					return textEditor.document.getText(range)
				})
				.join('\n')

			vscode.env.clipboard.writeText(joinedContent)
		}),
		vscode.commands.registerCommand('syncScroll.copyAllSelectionsInCurrentFile', (textEditor) => {
			const joinedContent = textEditor.selections
				.map((selection: vscode.Selection) => {
					const range = calculateRange(selection, offsetByEditors.get(textEditor))
					return textEditor.document.getText(range)
				})
				.join('\n')

			vscode.env.clipboard.writeText(joinedContent)
		}),
		vscode.commands.registerCommand('syncScroll.copyAllSelectionsInMultiFiles', () => {
	const joinedContent = flatMap(
		vscode.window.visibleTextEditors.filter(
			(editor: vscode.TextEditor) => editor.document.uri.scheme !== 'output'
		),
		(editor: vscode.TextEditor) =>
			editor.selections.map((selection: vscode.Selection) => {
				const range = calculateRange(selection, offsetByEditors.get(editor));
				return editor.document.getText(range);
			})
	).join('\n');

	vscode.env.clipboard.writeText(joinedContent);
}),
		vscode.window.onDidChangeVisibleTextEditors(textEditors => {
			AllStates.areVisible = checkSplitPanels(textEditors)
			reset()
		}),
		vscode.window.onDidChangeTextEditorVisibleRanges(({ textEditor, visibleRanges }) => {
			if (
					!AllStates.areVisible ||
					modeState.isOff() ||
					textEditor.viewColumn === undefined ||
					textEditor.document.uri.scheme === 'output'
			) {
				return
			}
			if (scrollingEditor !== textEditor) {
				if (scrolledEditorsQueue.has(textEditor)) {
					scrolledEditorsQueue.delete(textEditor)
					return
				}
				scrollingEditor = textEditor
				if (modeState.isOffsetMode()) {
					vscode.window.visibleTextEditors
							.filter(
									(editor) =>
											editor !== textEditor && editor.document.uri.scheme !== 'output'
							)
							.forEach((scrolledEditor) => {
								offsetByEditors.set(
										scrolledEditor,
										scrolledEditor.visibleRanges[0].start.line -
										textEditor.visibleRanges[0].start.line
								)
							})
				} else if (modeState.isNormalMode()) {
					offsetByEditors.clear()
				}
			}
			if (scrollingTask) {
				clearTimeout(scrollingTask)
			}
			scrollingTask = setTimeout(() => {
				vscode.window.visibleTextEditors
						.filter(
								(editor) =>
										editor !== textEditor && editor.document.uri.scheme !== 'output'
						)
						.forEach((scrolledEditor) => {
							scrolledEditorsQueue.add(scrolledEditor)
							scrolledEditor.revealRange(
									calculateRange(
											visibleRanges[0],
											offsetByEditors.get(scrolledEditor),
											textEditor,
											scrolledEditor
									),
									vscode.TextEditorRevealType.AtTop
							)
						})
			}, 0)
		}),
		vscode.window.onDidChangeTextEditorSelection(({ selections, textEditor }) => {
			if (
					!AllStates.areVisible ||
					modeState.isOff() ||
					textEditor.viewColumn === undefined ||
					textEditor.document.uri.scheme === 'output'
			) {
				return
			}
			correspondingLinesHighlight?.dispose()
			correspondingLinesHighlight = vscode.window.createTextEditorDecorationType({
				backgroundColor: new vscode.ThemeColor('editor.inactiveSelectionBackground'),
			})
			vscode.window.visibleTextEditors
					.filter(
							(editor) =>
									editor !== textEditor && editor.document.uri.scheme !== 'output'
					)
					.forEach((scrolledEditor) => {
						scrolledEditor.setDecorations(
								correspondingLinesHighlight!,
								selections.map((selection) =>
										calculateRange(selection, offsetByEditors.get(scrolledEditor))
								)
						)
					})
		})
	)

	AllStates.init(checkSplitPanels())
}

export function deactivate() {}
