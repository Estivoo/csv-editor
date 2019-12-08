// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below

import * as vscode from 'vscode';
import { CsvHtmlEditor } from './csv_editor';
import * as csv_parse from 'csv-parse';
import * as csv_stringify from 'csv-stringify';
import * as fs from 'fs';
import { Context } from 'vm';

var lastEditor : vscode.TextEditor | null;
var delimitersForFiles : Map<string, string> = new Map<string, string>();

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

function CheckDelimiter( testText : string, delimiter : string, clbk : ( result : boolean ) => void )
{
    csv_parse( testText, {
        delimiter: delimiter
    }, function( err : any, out : string[][] )
    {
        clbk( err === undefined && out[0].length > 1 );
    } );
}

function PredictDelimiter( textEditor : vscode.TextEditor, clbk : ( d : string ) => void )
{
    var known_delimiters = [ ',', ';', '|', '\t' ];
    var testText = textEditor.document.lineAt(0).text;

    var assumedDelimiter = '';
    var delimitersChecked = known_delimiters.length;
    known_delimiters.forEach( ( delimiter : string ) => {
        CheckDelimiter( testText, delimiter, (isValid) => {
            if( isValid )
            {
                if( assumedDelimiter !== '' )
                {
                    assumedDelimiter = '';
                }
                else
                {
                    assumedDelimiter = delimiter;
                }
            }
            delimitersChecked--;

            if( delimitersChecked === 0 )
            {
                if( assumedDelimiter === '' )
                {
                    var askUser : ( pm : string ) => void;
                    askUser = ( promptMsg : string ) => {
                        vscode.window.showInputBox( {
                            ignoreFocusOut: true,
                            placeHolder: ',',
                            prompt: promptMsg
                        } ).then( ( userDelimiter ) => {
                            if( userDelimiter === "" )
                            {
                                askUser( "Please enter delimiter ;)" );
                            }
                            else if( userDelimiter !== undefined )
                            {
                                if( userDelimiter === 'tab' )
                                {
                                    userDelimiter = '\t';
                                }
                                userDelimiter = userDelimiter.charAt( 0 );
                                CheckDelimiter( testText, userDelimiter, (validUserDelimiter) => {
                                    if( validUserDelimiter && userDelimiter !== undefined )
                                    {
                                        clbk( userDelimiter );
                                    }
                                    else
                                    {
                                        askUser( promptMsg = "Given delimiter " + userDelimiter + " is incorrect! Try again." );
                                    }
                                });
                            }
                        } );
                    };
                    askUser( "Couldn't predict delimiter. What's your delimiter? ( type 'tab' if you use tab as delimiter )" );
                }
                else
                {
                    clbk( assumedDelimiter );
                }
            }
        });
    } );
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
        PredictDelimiter( textEditor, ( delimiter : string ) => {
            if( textEditor !== null )
            {
                delimitersForFiles.set( fileName, delimiter );
                Parse( textEditor, false );
            }
        } );
    } );

    PredictDelimiter( lastEditor, ( delimiter : string ) => {
        if( lastEditor !== null )
        {
            delimitersForFiles.set( fileName, delimiter );
            ParseAndShow( lastEditor, context );
        }
    } );
}

function Parse( textEditor : vscode.TextEditor, clear : boolean )
{
    var fileName = textEditor.document.fileName;
    var definedDelimiter = delimitersForFiles.get( fileName );
    if( definedDelimiter === undefined )
    {
        definedDelimiter = ',';
    }

    csv_parse( textEditor.document.getText(), {
        delimiter: definedDelimiter
    }, function( err: any, out: any )
    {
        if( err )
        {
            if( definedDelimiter === "\t" )
            {
                vscode.window.showErrorMessage( "Tab as delimiter is working only with quotation marks." );
            }
            else
            {
                vscode.window.showErrorMessage( err.message );
            }

            return;
        }

        if( CsvHtmlEditor.currentPanel !== undefined )
        {
            CsvHtmlEditor.onSave( ( table ) =>{
                csv_stringify( table, {
                    quoted: true,
                    delimiter: definedDelimiter
                }, ( err, out ) => {
                    if( err )
                    {
                        vscode.window.showErrorMessage( err.message );
                        return;
                    }

                    var fileName = textEditor.document.fileName;
                    fs.writeFile( fileName, out, ( err ) => {
                        if( err )
                        {
                            vscode.window.showErrorMessage( err.message );
                            return;
                        }
                    });
                } );
            } );
            CsvHtmlEditor.currentPanel.setForm( out, clear );
        }
    });
}

function ParseAndShow( textEditor : vscode.TextEditor, context : Context )
{
    Parse( textEditor, true );
    CsvHtmlEditor.createOrShow(context.extensionPath);
}

export function deactivate() {}
