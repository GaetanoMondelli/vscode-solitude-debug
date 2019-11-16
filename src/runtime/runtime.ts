
import { EventEmitter } from 'events';
import { PythonShell } from 'python-shell';
import { EditorHelper } from '../editorHelper'
import { TaskQueue } from '../taskQueue';
import { ContractManager } from './contractManager'
import { SolitudeDebugSession, SolitudeBreakpoint } from './solitudeDebugSession'


export class Runtime extends EventEmitter {

	private _contractManager = new ContractManager();
	private _solitudeDebugSession = new SolitudeDebugSession();
	// To be removed
	private _breakpointId = 1;
	private _breakPoints = new Map<string, SolitudeBreakpoint[]>();
	private _breakpointFound = false;

	private _solitudeConfigurationPath: string;
	private _pythonPath: string;
	private _shell;

	private taskQueue: TaskQueue;
	private _editorHelper: EditorHelper;

	constructor() {
		super();
		this.taskQueue = new TaskQueue();
		this._editorHelper = new EditorHelper();
	}

	public get sourceFile() {
		return this._contractManager.getSourceFile();
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

	public getSolitudeDebugSession(){
		return this._solitudeDebugSession;
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

	private verifyBreakpoints(path): void {
		let bps = this._breakPoints.get(path);
		if (bps) {
			this._contractManager.setOrUpdateContractSource(path)
			bps.forEach(bp => {
				if (!bp.verified && bp.line < this._contractManager.getContractLines.length) {
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
			this._solitudeDebugSession.clearVariables();
			for (let variable of msg['response']['variables']) {
				this._solitudeDebugSession.addVariable(variable['name'], "string", variable['value_string'])
			}
		}
		else if (msg['response']['type'] == "backtrace") {
			// if (!this._sourceFile || !this._currentLine) {
			// 	return true;
			// }

			// if (this._contractSource == undefined || this._contractLine == undefined) {
			// 	this._contractSource = this.sourceFile;
			// 	this._contractLine = this._currentLine;
			// }

			if (msg['response']['frames'].length > this._solitudeDebugSession.getStack().length) {
				this._solitudeDebugSession.addNewStackFrameIfPossible(msg['response']['frames'], this._contractManager.getSourceFile(), this._contractManager.getCurrentLine());
			}
			else if (msg['response']['frames'].length < this._solitudeDebugSession.getStack().length) {
				this._solitudeDebugSession.removeLastStackFrame();
			}

			this._solitudeDebugSession.updateStackFrame(msg['response']['frames']);

			this._solitudeDebugSession.updateContractSourceLineInTopStackFrame(this._contractManager.getSourceFile(), this._contractManager.getCurrentLine())

		}
		else if (msg['response']['type'] == "break") {
			if (msg['status'] == 'ok') {
				this.verifyBreakpoints(msg['response']['breakpoint_name']);
			}
		}
		else if (msg['response']['type'] == "revert") {
			// this._sourceFile = msg['response']['code']['path']
			// this._currentLine = msg['response']['code']['line_index'];
			this._contractManager.setOrUpdateContractSource(msg['response']['code']['path']);
			this._contractManager.setContractLine(msg['response']['code']['line_index']);
			let start = msg['response']['code']['line_pos'];
			let end = start + msg['response']['code']['line_lenght'];
			this._editorHelper.updateRange(start, end);
			this._solitudeDebugSession.setExceptionMessage( msg['response']['code']['text']);
			this._solitudeDebugSession.setExceptionFoundFlag();
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
					//this._sourceFile = msg['response']['code']['path']
					//this._currentLine = msg['response']['code']['line_index'];
					this._contractManager.setOrUpdateContractSource(msg['response']['code']['path']);
					this._contractManager.setContractLine(msg['response']['code']['line_index']);
					let start = msg['response']['code']['line_pos']
					let end = start + msg['response']['code']['line_lenght']
					this._editorHelper.updateRange(start, end);
					this._editorHelper.renderCodeInfo(this._contractManager.getCurrentLine());
				}
			}
			if (msg['response']['type'] == 'breakpoint') {
				this._breakpointFound = true;
			}
		}
		if (this.taskQueue.isEmpty()) {
			if (this._solitudeDebugSession.isExceptionFound()) {
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