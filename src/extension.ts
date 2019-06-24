// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import * as vscode from 'vscode';
import { CsvHtmlEditor } from './csv_editor';
import * as csv_parse from 'csv-parse';
import * as csv_stringify from 'csv-stringify';
import * as fs from 'fs';
import { performance } from 'perf_hooks';
import { Context } from 'vm';

var lastEditor : vscode.TextEditor | null;
export function activate(context: vscode.ExtensionContext) {
	let disposable;
	vscode.window.registerWebviewPanelSerializer("webview", {
		async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
			CsvHtmlEditor.revive(webviewPanel, context.extensionPath);
		}
	});

	context.subscriptions.push(
		vscode.commands.registerCommand('csvEditor.show', () => {
			let activeTextEditor = vscode.window.activeTextEditor;
			if( activeTextEditor !== null && activeTextEditor !== undefined )
			{
				lastEditor = null;
				UpdateEditor( activeTextEditor, context );
			}
		})
	);

	vscode.window.onDidChangeActiveTextEditor( (editor)=>{
		if( editor !== undefined && CsvHtmlEditor.currentPanel !== undefined )
		{
			UpdateEditor( editor, context );
		}
		return;
	}, null, disposable );
}

function UpdateEditor( textEditor : vscode.TextEditor, context : Context )
{
	if( textEditor === lastEditor || !textEditor.document.fileName.endsWith( ".csv" ) )
	{
		return;
	}

	lastEditor = textEditor;

	var fileName = textEditor.document.fileName;
	fs.watchFile( fileName, () => {
		Parse( textEditor, false );
	} );

	ParseAndShow( lastEditor, context );
}

function Parse( textEditor : vscode.TextEditor, clear : boolean )
{
	var t0 = performance.now();
	csv_parse(textEditor.document.getText(), {}, function(err: any, out: any)
	{
		var t1 = performance.now();
		console.log("Vsc parse took " + (t1 - t0) + " milliseconds.");
		if( err )
		{
			vscode.window.showErrorMessage( err.message );
			return;
		}

		if(CsvHtmlEditor.currentPanel !== undefined)
		{
			CsvHtmlEditor.onSave( ( table ) =>{
				csv_stringify( table, {
					quoted:true
				}, ( err, out ) => {
					if( err )
					{
						vscode.window.showErrorMessage( err.message );
						return;
					}

					var fileName = textEditor.document.fileName;
					fs.writeFile( fileName, out, (err) => {
						if( err )
						{
							vscode.window.showErrorMessage( err.message );
							return;
						}
					});
				} );
			} );
			CsvHtmlEditor.currentPanel.setForm( out, clear );
			var t2 = performance.now();
			console.log("Both took " + (t2 - t0) + " milliseconds.");
		}
	});
}

function ParseAndShow( textEditor : vscode.TextEditor, context : Context )
{
	Parse( textEditor, true );
	CsvHtmlEditor.createOrShow(context.extensionPath);
}

export function deactivate() {}
