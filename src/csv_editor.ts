import * as vscode from 'vscode';
import * as path from 'path';

export class CsvHtmlEditor {
	public static currentPanel: CsvHtmlEditor | undefined = undefined;

	public static readonly viewType = 'csvEditor';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionPath: string;
    private _disposables: vscode.Disposable[] = [];
    
    private static fieldsValue : string[][] = [];

    private static saveCallback : ( table : string[][] ) => void;
    private lastId : string = "";
    
    public static createOrShow(extensionPath: string) {
		const column = vscode.ViewColumn.Two;

		if (CsvHtmlEditor.currentPanel) {
			CsvHtmlEditor.currentPanel._panel.reveal(CsvHtmlEditor.currentPanel._panel.viewColumn);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			CsvHtmlEditor.viewType,
			'CSV Editor',
			column,
			{
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(path.join(extensionPath, 'scripts'))]
			}
		);

		CsvHtmlEditor.currentPanel = new CsvHtmlEditor(panel, extensionPath);
    }
    
    public static onSave( callback: ( table : string[][] ) => void )
    {
        CsvHtmlEditor.saveCallback = callback;
    }

    private constructor(panel: vscode.WebviewPanel, extensionPath: string) {
		this._panel = panel;
		this._extensionPath = extensionPath;

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'idChange':
                        this.lastId = message.value;
                        this.SendValues( this.lastId );
                        return;
                    case 'saveChanges':
                        this.SaveChanges( message.value );
                        return;
				}
			},
			null,
			this._disposables
		);
    }

    private SendValues( key : string )
    {
        let newValues = CsvHtmlEditor.fieldsValue.find((v) => { return v[0] === key; });
        if (newValues !== undefined) {
            this.SendMessage("changeValues", newValues);
        }
        else {
            this.SendMessage("changeValues", []);
        }
    }

    private SendMessage( command : string, data : any )
    {
        if( CsvHtmlEditor.currentPanel !== undefined )
        {
            CsvHtmlEditor.currentPanel._panel.webview.postMessage( { command: command, data: data } );
        }
    }

    private SaveChanges( values : string[] )
    {
        let index = CsvHtmlEditor.fieldsValue.findIndex( (v)=>{ return v[0] === values[0]; } );
        if( index !== -1 )
        {
            CsvHtmlEditor.fieldsValue[index] = values;
            if( CsvHtmlEditor.saveCallback )
            {
                CsvHtmlEditor.saveCallback( CsvHtmlEditor.fieldsValue );
            }
        }
        else
        {
            vscode.window.showWarningMessage( `${values[0]} doesn't exist. Add?`, 'Yes', 'No' ).then(
                ( value ) =>
                {
                    if( value === "Yes" )
                    {
                        CsvHtmlEditor.fieldsValue.push( values );
                        this.SaveChanges( values );
                    }
                }
            );
        }
    }   

    public static revive(panel: vscode.WebviewPanel, extensionPath: string) {
		CsvHtmlEditor.currentPanel = new CsvHtmlEditor(panel, extensionPath);
	}

    public dispose() {
		CsvHtmlEditor.currentPanel = undefined;

		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

    public setForm( fields : string[][], clear : boolean )
    {
        if( clear )
        {
            this.lastId = "";
        }

        CsvHtmlEditor.fieldsValue = fields;
        this._panel.webview.html = this.createPage(fields[0]);

        if( this.lastId !== "" )
        {
            this.SendValues( this.lastId );
        }
    }

    private createPage( headersV : string[] ): string {
            const script1PathOnDisk = vscode.Uri.file(
                path.join(this._extensionPath, 'scripts', 'jquery-1.12.4.js')
            );
            const script2PathOnDisk = vscode.Uri.file(
                path.join(this._extensionPath, 'scripts', 'jquery-ui.min.js')
            );
            const script3PathOnDisk = vscode.Uri.file(
                path.join(this._extensionPath, 'scripts', 'jquery-ui.css')
            );

            // And the uri we use to load this script in the webview
            const script1Uri = script1PathOnDisk.with({ scheme: 'vscode-resource' });
            const script2Uri = script2PathOnDisk.with({ scheme: 'vscode-resource' });
            const script3Uri = script3PathOnDisk.with({ scheme: 'vscode-resource' });

            const nonce = CsvHtmlEditor.getNonce();

            let forms : string = "";
            let fields : string[] = [];
            let htmlOptionsFields : string = "";
            for (let i = 1; i < headersV.length; i++) {
                let l = `${headersV[i]} :<br><textarea type="text" id="ta${i}" value="" cols="100" rows=""></textarea><br>`;
                forms = forms + l;
                fields[i] = `${headersV[i]}`;
            }
            headersV.forEach( (v)=>{
                htmlOptionsFields = htmlOptionsFields + `<option value="${v}">${v}</option>`;
            } );
            htmlOptionsFields = htmlOptionsFields + `<option value="">None</option>`;

            let allIds : string = "";
            CsvHtmlEditor.fieldsValue.forEach( (v)=>{
                allIds += `"${v[0]}",`;
            } );
            allIds = allIds.slice( 0, -1 );

            return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src vscode-resource: https:; style-src 'unsafe-inline' vscode-resource: https:; img-src vscode-resource: https:; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Cat Coding</title>
                <script src="${script1Uri}" nonce="${nonce}"></script>
                <script src="${script2Uri}" nonce="${nonce}"></script>
                <link rel="stylesheet" href="${script3Uri}">
            </head>
            <body>
            ${headersV[0]}:<br>
            <div class="ui-widget" style="width:100%;">
                <input id="ids" class="ui-autocomplete-input" style="width:600px;">
            </div>
            <br>
            ${forms}
            <br>
            <button id="saveBtn" class="link">SAVE</button>
            </body>
            <script nonce="${nonce}">
                document.getElementById("saveBtn").addEventListener("click", saveChanges);
                document.getElementById("ids").addEventListener("input", function() { idChanged(this.value); } );

                document.getElementById("ids").value = '${this.lastId}';
                const vscode = acquireVsCodeApi();

                var lastSelected;
                var source = [ ${allIds} ];
                $("#ids").autocomplete( {
                    source: source,
                    minLength: 1,
                    select: function( event, ui )
                    {
                        if( ui != null )
                        {
                            lastSelected = ui.item.label;
                            idChanged( lastSelected );
                        }
                    },
                    focus: function( event, ui )
                    {
                        if( ui != null )
                        {
                            idChanged( ui.item.label );
                        }
                    },
                    close: function( event, ui )
                    {
                        if( lastSelected != null )
                        {
                            idChanged( lastSelected );
                        }
                    }
                } );

                function changeValues( data )
                {
                    for( var i = 1; i < ${headersV.length}; i++ )
                    {
                        var ta = document.getElementById( 'ta' + i );
                        if( ta != null )
                        {
                            ta.value = data[i] == null ? "" : data[i];
                        }
                    }
                }

                function idChanged( newId )
                {
                    vscode.postMessage({
                        command: 'idChange',
                        value: newId
                    })
                }

                function saveChanges()
                {
                    var key = document.getElementById( 'ids' ).value;
                    var newState = [
                        key
                    ];

                    for( var i = 1; i < ${headersV.length}; i++ )
                    {
                        var ta = document.getElementById( 'ta' + i );
                        if( ta != null )
                        {
                            newState.push( ta.value );
                        }
                    }

                    vscode.postMessage({
                        command: 'saveChanges',
                        value: newState
                    });
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'changeValues':
                            changeValues( message.data );
                            break;
                    }
                });
            </script>
            </html>
            `;
    }

    private static getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

}

