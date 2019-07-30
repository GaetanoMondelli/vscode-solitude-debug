/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import { DebugSession } from './debug';
import * as Net from 'net';
import {existsSync} from 'fs';

/*
 * Set the following compile time flag to true if the
 * debug adapter should run inside the extension host.
 * Please note: the test suite does no longer work in this mode.
 */
const EMBED_DEBUG_ADAPTER = true;

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('extension.solitude-debug.getTransaction', config => {
		return vscode.window.showInputBox({
			placeHolder: "Please enter the transaction hash",
			value: "0x48852881a1eaec20fd6d915e72a28f6b1cefafe5ad7515914e2653439a597599"
		});
	}));

	const provider = new ConfigurationProvider()
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('solitude', provider));
	context.subscriptions.push(provider);
}

export function deactivate() {
}

class ConfigurationProvider implements vscode.DebugConfigurationProvider {

	private _server?: Net.Server;

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {

		// if launch.json is missing or empty
		if (!config.type && !config.request && !config.name) {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.languageId === 'markdown' ) {
				config.type = 'solitude';
				config.name = 'Launch';
				config.request = 'launch';
				config.program = '${file}';
				config.stopOnEntry = true;
			}
		}

		if (!config.program) {
			return vscode.window.showInformationMessage("Cannot find a program to debug").then(_ => {
				return undefined;	// abort launch
			});
		}

		if (EMBED_DEBUG_ADAPTER) {
			// start port listener on launch of first debug session
			if (!this._server) {
				// start listening on a random port
				this._server = Net.createServer(socket => {
					const session = new DebugSession();
					session.setRunAsServer(true);
					let solitudeConfigPath = '';
					if(folder)
						solitudeConfigPath =  this.setSolitudePreference(session, folder.uri.path) + '/solitude.yaml'
					if (solitudeConfigPath == '' || !existsSync(solitudeConfigPath)) {
						return vscode.window.showErrorMessage(`Configuration cannot be found: ${solitudeConfigPath}. Please check solitude settings.`)
					}
					session.start(<NodeJS.ReadableStream>socket, socket);
				}).listen(0);
			}

			// make VS Code connect to debug server instead of launching debug adapter
			config.debugServer = this._server.address().port;

		}

		return config;
	}

	setSolitudePreference(session: DebugSession, workspaceFolder: string) : string {

		let config = vscode.workspace.getConfiguration('solitude-exstension-debugger');

		session.setPyhtonPath(config['pythonPath'])

		if (config['useWorkspaceFolder'] == true){ //&& false){
			session.setSolitudeConfigurationPath(workspaceFolder)
			return workspaceFolder
		}
		else{
			let path = config['solitudeConfigurationPath']
			session.setSolitudeConfigurationPath(path)
			return path
		}
	}

	dispose() {
		if (this._server) {
			this._server.close();
		}
	}
}
