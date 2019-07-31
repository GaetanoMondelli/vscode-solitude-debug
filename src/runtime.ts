import { readFileSync } from 'fs';
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
	private _stack : any[];

	private _taskQueue: any[];


	private evaluatedExpressionDecoration = vscode.window.createTextEditorDecorationType({
		borderWidth: '1px',
		borderStyle: 'solid',
		backgroundColor: 'blue',
		//overviewRulerLane: vscode.OverviewRulerLane.Right,
	});
	private _range: vscode.DecorationOptions = { range: new vscode.Range(0,0,0,0) };
	private _expression: vscode.DecorationOptions[] = [];


	constructor() {
		super();
		this._taskQueue = [];
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
		this._shell = new PythonShell("solitude", options)

		this._shell.on('message', command => {
			this.processMessage(command);
		});

		this.step()
		this.step()
	}

	public continue(reverse = false) {
		this.step();
	}

	public step(reverse = false, event = 'stopOnStep') {
		this._taskQueue.push({ command: "step", args: "" })
		this._taskQueue.push({ command: "info_locals", args: "" })
		this._taskQueue.push({ command: "backtrace", args: "" })


		this.processTaskQueue();
	}

	public variables(): any {
		return this._variables;
	}

	public stack(startFrame: number, endFrame: number): any {
		return {
			frames: this._stack,
			count: this._stack.length
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

	private verifyBreakpoints(path): void {
		let bps = this._breakPoints.get(path);
		if (bps) {
			this.loadSource(path);
			bps.forEach(bp => {
				if (!bp.verified && bp.line < this._sourceLines.length) {
					const srcLine = this._sourceLines[bp.line].trim();
					if (!(srcLine.startsWith("/") || srcLine.startsWith('*'))){
						bp.verified = true;
						this.sendEvent('breakpointValidated', bp);
					}
				}
			});
		}
	}

	private processTaskQueue(){
		if(this._taskQueue.length > 0) {
			let command = this._taskQueue.shift();
			this._shell.send(command);
		}
	}

	private processMessage(msg) {
		this.sendEvent('output','hello'+JSON.stringify(this._breakPoints), this.sourceFile, this._currentLine, 2);
		if (msg['response']['type'] == "info_locals") {
			this._variables = [];
			for (let variable of msg['response']['variables']) {
				this._variables.push({
					name: variable['name'],
					type: "string",
					value:variable['value_string'],
					variablesReference: 0
				});
			}
		}
		else if (msg['response']['type'] == "backtrace") {
			this._stack = [];
			for (let frame of msg['response']['frames']) {
				this._stack.push({
					index: frame.index,
					name: `${frame.description}(${1})`,
					file: this._sourceFile,
					line: this._currentLine
				});
			}
		}
		else if (msg['status'] == 'ok') {
			if (msg['response']['code']['path'] == null){
			}
			else{
				let path = msg['response']['code']['path']
				this.loadSource(path);
				this._currentLine = msg['response']['code']['line_index'];
				let editor = vscode.window.activeTextEditor;

				this._expression = []
				if (editor)
				editor. setDecorations(this.evaluatedExpressionDecoration, this._expression)

				let start = msg['response']['code']['line_pos']
				let end =  start + msg['response']['code']['line_lenght']

				if (editor) {
					if(end > start) {
					this._range = { range: new vscode.Range(this._currentLine, start, this._currentLine, end) };
					this._expression.push(this._range)
					editor.setDecorations(this.evaluatedExpressionDecoration, this._expression)
					}
				}
			}
		}
		this.sendEvent('stopOnStep');
		this.processTaskQueue()
	}

	private sendEvent(event: string, ...args: any[]) {
		setImmediate(_ => {
			this.emit(event, ...args);
		});
	}
}