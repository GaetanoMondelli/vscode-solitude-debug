import { readFileSync } from 'fs';
import { EventEmitter } from 'events';
import { PythonShell } from 'python-shell';
import { EditorHelper } from './editorHelper'
import { TaskQueue } from './taskQueue';

export interface SolitudeBreakpoint {
	fullpath: string;
	id: number;
	line: number;
	verified: boolean;
}
export class Runtime extends EventEmitter {

	private _sourceFile: string;
	private _exceptionMessage: string;
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
	private _variablesFrame: any[];
	private _stack: any[];
	private _exceptionFound = false;
	private _breakpointFound = false;
	private _contractSource: string;
	private _contractLine: number;
	private taskQueue: TaskQueue;
	private _editorHelper: EditorHelper;

	constructor() {
		super();
		this.taskQueue = new TaskQueue();
		this._stack = [];
		this._variablesFrame = [];
		this._editorHelper = new EditorHelper();
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

	public start(txhash: string, stopOnEntry: boolean) {
		let options = this.getPythonOptions(txhash)
		this._shell = new PythonShell("solitude", options)

		this._shell.on('message', command => {
			this.processMessage(command);
		});

		this.sendEvent('initialized');
		this.step();
	}

	public disconnect() {
		this._editorHelper.clearEditor();
	}

	public getInfo() {
		this.taskQueue.getInfo();
		this.processTaskQueue();
	}

	public continue(reverse = false) {
		this.taskQueue.continue();
		this.processTaskQueue();
	}

	public step(reverse = false, event = 'stopOnStep') {
		this.taskQueue.step();
		this.processTaskQueue();
	}

	public getVariables(variableId = 'local_0'): any {
		const frameNumber = +variableId.split('_')[1];
		if (frameNumber == 0) {
			return this._variables;
		}
		return this._variablesFrame[frameNumber];
	}

	public getStack(): any {
		return this._stack;
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
		this.taskQueue.setBreakpoint(pathArray[pathArray.length - 1] + ':' + line)
		this.processTaskQueue()

		return bp;
	}

	public setFunctionBreakPoint(name: string) {
		this.taskQueue.setBreakpoint(name)
		this.processTaskQueue()
	}

	public clearBreakPoint(path: string): SolitudeBreakpoint | undefined {
		let bps = this._breakPoints.get(path);
		let pathArray = path.split('/');
		if (bps) {
			const bp = bps[0];
			let line = bp.line;
			this.taskQueue.clearBreakpoint(pathArray[pathArray.length - 1] + ':' + line);
			bps.splice(0, 1);
			this.processTaskQueue();

			return bp;
		}
		return undefined;
	}

	public clearBreakpoints(path: string): void {
		this._breakPoints.delete(path);
	}

	public getLastException() {
		return this._exceptionMessage;
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

		if (!this.taskQueue.isEmpty()) {
			let command = this.taskQueue.processTaskQueue();
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
			if (!this._sourceFile || !this._currentLine) {
				return true;
			}

			if (this._contractSource == undefined || this._contractLine == undefined) {
				this._contractSource = this.sourceFile;
				this._contractLine = this._currentLine;
			}

			if (msg['response']['frames'].length > this._stack.length) {
				for (let index = 0; index < this._stack.length; index++) {
					this._stack[index].index = `${index + 1}`;
				}
				if (this._stack.length > 1) {
					this._stack[this._stack.length - 1].file = this._contractSource;
					this._stack[this._stack.length - 1].line = this._contractLine;
				}
				if (this._breakpointFound || this._exceptionFound) {
					this._stack = this._stack.slice(0, 2);
					this._stack[this._stack.length - 1].index = msg['response']['frames'].length - 1
					for (let index = msg['response']['frames'].length - 2; index > 0; index--) {
						let frame = msg['response']['frames'].find(element => element.index == index);
						this._stack.unshift({
							index: `${frame.index}`,
							name: `${frame.description}(${1})`,
							file: this._sourceFile,
							line: this._currentLine,
							invalidVariables: true
						});
						this._variablesFrame.unshift(this._variables.slice())
					}
				}
				let frame = msg['response']['frames'].find(element => element.index == 0);
				this._stack.unshift({
					index: '0',
					name: `${frame.description}(${1})`,
					file: this._sourceFile,
					line: this._currentLine,
					invalidVariables: false

				});
				this._variablesFrame.unshift(this._variables)
			}
			else if (msg['response']['frames'].length < this._stack.length) {
				this._stack.shift();
				this._variablesFrame.shift();
			}
			this._stack[0].line = this._currentLine;
			this._stack[0].file = this._sourceFile;
		}
		else if (msg['response']['type'] == "break") {
			if (msg['status'] == 'ok') {
				this.verifyBreakpoints(msg['response']['breakpoint_name']);
			}
		}
		else if (msg['response']['type'] == "revert") {
			this._sourceFile = msg['response']['code']['path']
			this._currentLine = msg['response']['code']['line_index'];
			let start = msg['response']['code']['line_pos'];
			let end = start + msg['response']['code']['line_lenght'];
			this._editorHelper.updateRange(start, end);
			this._exceptionMessage = msg['response']['code']['text'];
			this._exceptionFound = true;
			this.taskQueue.empty();
			this.getInfo();
		}
		else if (msg['response']['type'] == "end") {
			this._editorHelper.clearEditor();
			this.sendEvent('end');
			return true;
		}
		else if (msg['response']['type'] == 'step' || msg['response']['type'] == 'breakpoint') {
			if (msg['status'] == 'ok') {
				if (msg['response']['code']['path'] != null) {
					this._sourceFile = msg['response']['code']['path']
					this._currentLine = msg['response']['code']['line_index'];
					let start = msg['response']['code']['line_pos']
					let end = start + msg['response']['code']['line_lenght']
					this._editorHelper.updateRange(start, end);
					this._editorHelper.renderCodeInfo(this._currentLine);
				}
			}
			if (msg['response']['type'] == 'breakpoint') {
				this._breakpointFound = true;
			}
		}
		if (this.taskQueue.isEmpty()) {
			if (this._exceptionFound) {
				this.sendEvent('stopOnException');
				this.processTaskQueue();
				return true;
			}
			if (this._breakpointFound) {
				this.sendEvent('stopOnBreakpoint');
				this._breakpointFound = false;
				return true;
			}
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
}