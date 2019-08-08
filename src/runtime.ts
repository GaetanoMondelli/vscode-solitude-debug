import { readFileSync } from 'fs';
import { EventEmitter } from 'events';
import { PythonShell } from 'python-shell';
import * as vscode from 'vscode';

export interface SolitudeBreakpoint {
	fullpath: string;
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
	private _start = 0;
	private _end = 0;
	private _breakPoints = new Map<string, SolitudeBreakpoint[]>();
	private _breakpointId = 1;
	private _solitudeConfigurationPath: string;
	private _pythonPath: string;
	private _shell;
	private _variables: any[];
	private _stack: any[];
	private _exceptionFound = false;

	private _taskQueue: any[];


	private evaluatedExpressionDecoration = vscode.window.createTextEditorDecorationType({
		borderWidth: '1px',
		borderStyle: 'solid',
		backgroundColor: 'blue',
		//overviewRulerLane: vscode.OverviewRulerLane.Right,
	});
	private evaluatedExceptionDecoration = vscode.window.createTextEditorDecorationType({
		borderWidth: '1px',
		borderStyle: 'solid',
		backgroundColor: 'red',
		//overviewRulerLane: vscode.OverviewRulerLane.Right,
	});
	private _range: vscode.DecorationOptions = { range: new vscode.Range(0, 0, 0, 0) };
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

		this.sendEvent('initialized');
		this.step();
		this.step();
	}

	public getInfo(){
		this._taskQueue.push({ command: "info_locals", args: "" })
		this._taskQueue.push({ command: "backtrace", args: "" })
	}

	public continue(reverse = false) {
		this._taskQueue.push({ command: "continue", args: "" })
		this._taskQueue.push({ command: "info_locals", args: "" })
		this._taskQueue.push({ command: "backtrace", args: "" })

		this.processTaskQueue();
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
		const bp = <SolitudeBreakpoint>{ fullpath: path, verified: false, line, id: this._breakpointId++ };
		let bps = this._breakPoints.get(path);
		let pathArray = path.split('/');
		if (!bps) {
			bps = new Array<SolitudeBreakpoint>();
			this._breakPoints.set(pathArray[pathArray.length - 1], bps);
		}
		bps.push(bp);
		this._taskQueue.unshift({ "command": "break", "args": [pathArray[pathArray.length - 1]+':'+line] })
		this.processTaskQueue()

		return bp;
	}

	public setFunctionBreakPoint(name: string) {
		// is there a way to clear this?
		//const bp = <SolitudeBreakpoint>{ fullpath: path, verified: false, line, id: this._breakpointId++ };
		this._taskQueue.unshift({ "command": "break", "args": [name] })
		this.processTaskQueue()
	}

	public clearBreakPoint(path: string): SolitudeBreakpoint | undefined {
		let bps = this._breakPoints.get(path);
		let pathArray = path.split('/');
		if (bps) {
			const bp = bps[0];
			let line = bp.line;
			this._taskQueue.unshift({ "command": "delete", "args": [pathArray[pathArray.length - 1]+':'+line] })
			bps.splice(0, 1);
			this.processTaskQueue();

			return bp;
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
					bp.verified = true;
					this.sendEvent('breakpointValidated', bp);
				}
			});
		}
	}

	private processTaskQueue() {
		if (this._taskQueue.length > 0) {
			let command = this._taskQueue.shift();
			this._shell.send(command);
		}
	}

	private processMessage(msg) {
		if (msg['response']['type'] == "info_locals") {
			this._variables = [];
			for (let variable of msg['response']['variables']) {
				this._variables.push({
					name: variable['name'],
					type: "string",
					value: variable['value_string'],
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
		else if (msg['response']['type'] == "break") {
			if (msg['status'] == 'ok') {
				this.verifyBreakpoints(msg['response']['breakpoint_name']);
			}
		}
		else if (msg['response']['type'] == "revert") {
			this._sourceFile = msg['response']['code']['path']
			this._currentLine = msg['response']['code']['line_index'];
			this._start = msg['response']['code']['line_pos']
			this._end = this._start + msg['response']['code']['line_lenght']
			this.sendEvent('output', 'Exception: '+ msg['response']['code']['text'], msg['response']['code']['absolute_path'],msg['response']['code']['line_index'],msg['response']['code']['line_pos']);
			this._exceptionFound = true;
			this._taskQueue = [];
			this.getInfo();
		}
		else if (msg['response']['type'] == "end"){
			this.clearEditor();
			this.sendEvent('end');
			return true;
		}
		else if (msg['status'] == 'ok') {
			if (msg['response']['code']['path'] == null) {
			}
			else {
				this._sourceFile = msg['response']['code']['path']
				this._currentLine = msg['response']['code']['line_index'];
				this._start = msg['response']['code']['line_pos']
				this._end = this._start + msg['response']['code']['line_lenght']
				this.renderCodeInfo(this.evaluatedExpressionDecoration);
			}
		}
		if(this._exceptionFound && this._taskQueue.length == 0){
			this.renderCodeInfo(this.evaluatedExceptionDecoration);
			this.sendEvent('stopOnException');
			return true;
		}
		this.sendEvent('stopOnStep');
		this.processTaskQueue()
		return true;
	}

	private sendEvent(event: string, ...args: any[]) {
		setImmediate(_ => {
			this.emit(event, ...args);
		});
	}

	private clearEditor(){
		let editor = vscode.window.activeTextEditor;
		this._expression = []
		if (editor){
			editor.setDecorations(this.evaluatedExceptionDecoration, this._expression)
			editor.setDecorations(this.evaluatedExpressionDecoration, this._expression)
		}
	}

	private highlightWord(decorationStyle: vscode.TextEditorDecorationType){
		let editor = vscode.window.activeTextEditor;
		if (editor) {
			if (this._end > this._start) {
				this._range = { range: new vscode.Range(this._currentLine, this._start, this._currentLine, this._end) };
				this._expression.push(this._range)
				editor.setDecorations(decorationStyle, this._expression)
			}
		}
	}

	private renderCodeInfo(decorationStyle: vscode.TextEditorDecorationType ){
		this._currentLine = this._currentLine;
		this.loadSource(this.sourceFile);
		this.clearEditor();
		this.highlightWord(decorationStyle);
	}
}