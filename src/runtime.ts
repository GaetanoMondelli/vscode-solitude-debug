import { readFileSync, writeFileSync, existsSync } from 'fs';
import { EventEmitter } from 'events';
import { PythonShell } from 'python-shell';
import * as vscode from 'vscode';


export interface SolitudeBreakpoint {
	id: number;
	line: number;
	verified: boolean;
}
export class Runtime extends EventEmitter {

	private _sourceFile: string;
	public get sourceFile() {
		return this._sourceFile;
	}

	private _sourceLines: string[];
	private _currentLine = 0;
	private _breakPoints = new Map<string, SolitudeBreakpoint[]>();
	private _breakpointId = 1;
	private _solitudeConfigurationPath: string;
	private _pythonPath: string;
	private _shell;
	private _variables: any[];

	constructor() {
		super();
	}

	public getPythonOptions(txHash: string) {
		process.chdir(this._solitudeConfigurationPath);
		type Modetype = "text" | "json" | "binary" | undefined
		let path = this._solitudeConfigurationPath + '/solitude.yaml'
		let params = ["--config", path, "debug", "--json", txHash]

		return {
			mode: "json" as Modetype,
			pythonPath: this._pythonPath,
			pythonOptions: ["-m"],
			//scriptPath: this._solitudePath,
			args: params
		};
	}

	public setSolitudeConfigurationPath(path: string) {
		this._solitudeConfigurationPath = path
	}

	public setPythonPath(path: string) {
		this._pythonPath = path
	}

	public start(program: string, stopOnEntry: boolean) {
		let options = this.getPythonOptions(program)
		writeFileSync('/home/gaetano/logs/options.log', JSON.stringify(options));
		// this._shell =  new PythonShell("solitude.cli.main", options)
		this._shell = new PythonShell("solitude", options)


		this._shell.on('message', command => {
			writeFileSync('/home/gaetano/logs/message.log', JSON.stringify(command));
			if (command['response']['type'] == "info_locals") {
				this._variables = [];
				for (let variable of command['response']['variables']) {
					this._variables.push({
						name: variable['name'],
						type: "string",
						value:variable['value_string'],
						variablesReference: 0
					});
				}
				writeFileSync('/home/gaetano/logs/thisvar.log', JSON.stringify(this._variables), { flag: 'a' });
			}
			if (command['status'] == 'ok' && command['response']['code']['path'] != null) {
				this._shell.send({ command: "info_locals", args: "" })
				let path = command['response']['code']['path']
				this.loadSource(path);
				this._currentLine = command['response']['code']['line_index'];
				this.sendEvent('stopOnStep');
				return true;
			}
			else {
				this._shell.send({ command: "step", args: "" })
			}
		});

		this._shell.send({ command: "step", args: "" })
	}

	public continue(reverse = false) {
		this._shell.send({ command: "step", args: "" })
	}

	public step(reverse = false, event = 'stopOnStep') {
		this._shell.send({ "command": "step", "args": "" })
	}

	public variables(): any {
		//this._shell.send({ command: "info_locals", args: "" })
		return this._variables;
	}

	public stack(startFrame: number, endFrame: number): any {
		const words = this._sourceLines[this._currentLine].trim().split(/\s+/);

		const frames = new Array<any>();
		for (let i = startFrame; i < Math.min(endFrame, words.length); i++) {
			const name = words[i];
			frames.push({
				index: i,
				name: `${name}(${i})`,
				file: this._sourceFile,
				line: this._currentLine
			});
		}
		return {
			frames: frames,
			count: words.length
		};
	}

	public setBreakPoint(path: string, line: number): SolitudeBreakpoint {
		const bp = <SolitudeBreakpoint>{ verified: false, line, id: this._breakpointId++ };
		let bps = this._breakPoints.get(path);
		if (!bps) {
			bps = new Array<SolitudeBreakpoint>();
			this._breakPoints.set(path, bps);
		}
		bps.push(bp);

		this.verifyBreakpoints(path);

		return bp;
	}

	public clearBreakPoint(path: string, line: number): SolitudeBreakpoint | undefined {
		let bps = this._breakPoints.get(path);
		if (bps) {
			const index = bps.findIndex(bp => bp.line === line);
			if (index >= 0) {
				const bp = bps[index];
				bps.splice(index, 1);
				return bp;
			}
		}
		return undefined;
	}

	public clearBreakpoints(path: string): void {
		this._breakPoints.delete(path);
	}

	private loadSource(file: string) {
		if (this._sourceFile !== file) {
			this._sourceFile = file;
			this._sourceLines = readFileSync(this._sourceFile).toString().split('\n');
		}
	}

	private verifyBreakpoints(path: string): void {
		let bps = this._breakPoints.get(path);
		if (bps) {
			this.loadSource(path);
			bps.forEach(bp => {
				if (!bp.verified && bp.line < this._sourceLines.length) {
					const srcLine = this._sourceLines[bp.line].trim();
					if (srcLine.length === 0 || srcLine.indexOf('+') === 0) {
						bp.line++;
					}
					if (srcLine.indexOf('-') === 0) {
						bp.line--;
					}
					if (srcLine.indexOf('lazy') < 0) {
						bp.verified = true;
						this.sendEvent('breakpointValidated', bp);
					}
				}
			});
		}
	}

	private sendEvent(event: string, ...args: any[]) {
		setImmediate(_ => {
			this.emit(event, ...args);
		});
	}
}