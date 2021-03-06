'use strict';

import { safeLoad } from 'js-yaml';
import { readFileSync } from 'fs';
import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import { DebugSession } from './debug';
import * as Net from 'net';
import { post } from 'request';

/*
 * Set the following compile time flag to true if the
 * debug adapter should run inside the extension host.
 * Please note: the test suite does no longer work in this mode.
 */
const EMBED_DEBUG_ADAPTER = true;
const defaultEndpoint = 'http://127.0.0.1:8545';

let workspaceFolder: string | undefined;
let solitudeConfigFilePath: string;
let endpoint: string;
let transactions: any[];

function convertPathToWindowFormat(path): string {
	let replacement = '\\';
	let winPath = path.replace(/\//g, replacement);
	return winPath = winPath.slice(1);
}

function getBlockRange(endpoint: string): Promise<Array<Number>> {
	return new Promise((resolve, reject) => {
		post(endpoint, { json: { jsonrpc: "2.0", method: "eth_blockNumber", params: [], "id": 1 } },
			(error, res, body) => {
				if (error) {
					reject(error);
				}
				let result = body.result;
				let min = 0;
				let max = Number(result);
				if (result > 10) {
					min = max - 10;
				}
				resolve([min, max]);
			});
	});
}

function getTransactionsCount(endpoint: string, blocknum: Number) {
	return new Promise((resolve, reject) => {
		let blockNumHex = '0x' + blocknum.toString(16);
		post(endpoint, { json: { jsonrpc: "2.0", method: "eth_getBlockTransactionCountByNumber", params: [blockNumHex], "id": 1 } },
			(error, res, body) => {
				if (error) {
					return reject(error);
				}
				return resolve(body.result);
			});
	});
}

function getTransaction(endpoint: string, block: Number, index: Number) {
	return new Promise((resolve, reject) => {
		let blockHex = '0x' + block.toString(16);
		let indexHex = '0x' + index.toString(16);
		post(endpoint, { json: { jsonrpc: "2.0", method: "eth_getTransactionByBlockNumberAndIndex", params: [blockHex, indexHex], "id": 1 } },
			(error, res, body) => {
				if (error) {
					reject(error);
				}
				resolve(body.result.hash);
			});
	});
}

function getTransactionReceipt(endpoint: string, txhash: String) {
	return new Promise((resolve, reject) => {
		post(endpoint, { json: { jsonrpc: "2.0", method: "eth_getTransactionReceipt", params: [txhash], "id": 1 } },
			(error, res, body) => {
				if (error) {
					reject(error);
				}
				resolve(body.result.contractAddress);
			});
	});
}

export async function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('extension.solitude-debug.getTransaction', async config => {
		let solitudeConfigPath = solitudeConfigFilePath;
		endpoint = defaultEndpoint;
		if (workspaceFolder && solitudeConfigPath == '${workspaceFolder}') {
			solitudeConfigPath = workspaceFolder;
		}

		if (solitudeConfigPath === undefined) {
			return vscode.window.showErrorMessage("solitude.yaml was not found in the workspace, please open a valid workspace");
		}
		let options = {};

		let path = solitudeConfigPath + '/solitude.yaml'
		try {
			options = safeLoad(readFileSync(path, 'utf8'))
		}
		catch (error) {
			try {
				options = safeLoad(readFileSync(convertPathToWindowFormat(path), 'utf8'));
			}
			catch{
				return vscode.window.showErrorMessage(`Cannot load config file: ${path}`);
			}
		}
		if ('Client.Endpoint' in options) {
			endpoint = options['Client.Endpoint'];
		}
		transactions = [];

		let range = await getBlockRange(endpoint);
		for (let blockIndex = Number(range[0]); blockIndex <= Number(range[1]); blockIndex++) {
			let count = await getTransactionsCount(endpoint, blockIndex);
			for (let txindex = 0; txindex < Number(count); txindex++) {
				let txhash: any = await getTransaction(endpoint, blockIndex, txindex);
				let isContractCreation = await getTransactionReceipt(endpoint, txhash)
				if (isContractCreation == null) {
					transactions.push(txhash);
				}
			}
		}

		return vscode.window.showQuickPick(transactions, {
			placeHolder: "Please enter the transaction hash",
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
			if (editor && editor.document.languageId === 'solidity') {
				config.type = 'solitude';
				config.name = 'Launch';
				config.request = 'launch';
				config.program = '${file}';
				config.stopOnEntry = true;
			}
		}

		if (!config.program) {
			//debugConfig.program = '';
			return vscode.window.showInformationMessage("Cannot find a program to debug").then(_ => {
				return undefined;	// abort launch
			});
		}

		solitudeConfigFilePath = config.solitudeConfigPath;

		if (folder) {
			workspaceFolder = folder.uri.path;
		}

		if (EMBED_DEBUG_ADAPTER) {
			// start port listener on launch of first debug session
			if (!this._server) {
				// start listening on a random port
				this._server = Net.createServer(socket => {
					const session = new DebugSession();
					session.setRunAsServer(true);
					let solitudeConfigFolderPath = '';
					 if (folder) {
						solitudeConfigFolderPath = config.solitudeConfigPath;
						if ((!solitudeConfigFolderPath || solitudeConfigFolderPath == '' || solitudeConfigFolderPath == "${workspaceFolder}")
						 && workspaceFolder != undefined) {
							solitudeConfigFolderPath = workspaceFolder;
						}
						try {
							this.setSolitudePreference(session, solitudeConfigFolderPath);
						}
						catch{
							return vscode.window.showErrorMessage(`Cannot load config file`);
						}

						this.setPythonPreference(session);
					}
					else {
						return vscode.window.showErrorMessage(`Configuration cannot be found in the workspacefolder`)
					}
					session.start(<NodeJS.ReadableStream>socket, socket);
				}).listen(0);
			}

			// make VS Code connect to debug server instead of launching debug adapter
			config.debugServer = this._server.address().port;
		}
		return config
	}


	setSolitudePreference(session: DebugSession, solitudeConfigPathLinuxStyle: string) {
		try {
			safeLoad(readFileSync(solitudeConfigPathLinuxStyle + '/solitude.yaml', 'utf8'))
			session.setSolitudeConfigurationFolderPath(solitudeConfigPathLinuxStyle);
			session.setSolitudeConfigurationPath(solitudeConfigPathLinuxStyle + '/solitude.yaml', true)
		}
		catch (error) {
			let solitudeConfigPathWindowsStyle = convertPathToWindowFormat(solitudeConfigPathLinuxStyle);
			safeLoad(readFileSync(solitudeConfigPathWindowsStyle + '\\solitude.yaml', 'utf8'))
			session.setSolitudeConfigurationFolderPath(solitudeConfigPathWindowsStyle);
			session.setSolitudeConfigurationPath(solitudeConfigPathWindowsStyle + '\\solitude.yaml', false)
		}
	}


	setPythonPreference(session: DebugSession): any {
		let config = vscode.workspace.getConfiguration('solitude-exstension-debugger');
		session.setPythonPath(config['pythonPath'])
	}


	dispose() {
		if (this._server) {
			this._server.close();
		}
	}
}
