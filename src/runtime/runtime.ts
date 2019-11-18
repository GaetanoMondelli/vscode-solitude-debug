
import { EventEmitter } from 'events';
import { PythonShell } from 'python-shell';
import { EditorHelper } from '../editorHelper'
import { TaskQueue } from '../taskQueue';
import { ContractManager } from './contractManager'
import { SolitudeDebugSession, SolitudeBreakpoint } from './solitudeDebugSession'


export class Runtime extends EventEmitter {

	private _contractManager = new ContractManager();
	private _solitudeDebugSession = new SolitudeDebugSession();

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
		this.taskQueue.getInfoCommand();
		this.processTaskQueue();
	}

	public continue(reverse = false) {
		this.taskQueue.continueCommand();
		this.processTaskQueue();
	}

	public step(reverse = false, event = 'stopOnStep') {
		this.taskQueue.stepCommand();
		this.processTaskQueue();
	}

	public getSolitudeDebugSession() {
		return this._solitudeDebugSession;
	}

	public setBreakPoint(path: string, line: number): SolitudeBreakpoint {
		let bp = this._solitudeDebugSession.addBreakpoint(path, line);
		this.taskQueue.setBreakpointCommand(path, line);
		this.processTaskQueue()

		return bp;
	}

	public setFunctionBreakPoint(name: string) {
		this.taskQueue.setFunctionBreakpointCommand(name)
		this.processTaskQueue()
	}

	public clearBreakPoint(path: string): SolitudeBreakpoint | undefined {
		let bp = this._solitudeDebugSession.clearBreakpoint(path);
		if (bp) {
			let pathArray = path.split('/');
			this.taskQueue.clearBreakpointCommand(pathArray[pathArray.length - 1] + ':' + bp.line);
			this.processTaskQueue();
		}
		return bp
	}

	public clearBreakpoints(path: string): void {
		this._solitudeDebugSession.clearBreakpoint(path);
	}

	private verifyBreakpoints(path: string): void {
		let bps = this._solitudeDebugSession.getVerifiedBreakpoints(path, this._contractManager.getContractLines.length);
		bps.forEach(bp => {
			this.sendEvent('breakpointValidated', bp);
		});
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
			this._solitudeDebugSession.updateStackFrame(msg['response']['frames']);
			this._solitudeDebugSession.updateContractSourceLineInTopStackFrame(this._contractManager.getSourceFile(), this._contractManager.getCurrentLine())
		}
		else if (msg['response']['type'] == "break") {
			if (msg['status'] == 'ok') {
				this.verifyBreakpoints(msg['response']['breakpoint_name']);
			}
		}
		else if (msg['response']['type'] == "revert") {
			this._contractManager.setOrUpdateContractSource(msg['response']['code']['path']);
			this._contractManager.setContractLine(msg['response']['code']['line_index']);
			let start = msg['response']['code']['line_pos'];
			let end = start + msg['response']['code']['line_lenght'];
			this._editorHelper.updateRange(start, end);
			this._solitudeDebugSession.setExceptionMessage(msg['response']['code']['text']);
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
					this._contractManager.setOrUpdateContractSource(msg['response']['code']['path']);
					this._contractManager.setContractLine(msg['response']['code']['line_index']);
					let start = msg['response']['code']['line_pos']
					let end = start + msg['response']['code']['line_lenght']
					this._editorHelper.updateRange(start, end);
					this._editorHelper.renderCodeInfo(this._contractManager.getCurrentLine());
				}
			}
			if (msg['response']['type'] == 'breakpoint') {
				this._solitudeDebugSession.setBreakpointFoundFlag();
			}
		}
		if (this.taskQueue.isEmpty()) {
			if (this._solitudeDebugSession.isExceptionFound()) {
				this.sendEvent('stopOnException');
				this.processTaskQueue();
				return true;
			}
			if (this._solitudeDebugSession.isBreakpointFound()) {
				this.sendEvent('stopOnBreakpoint');
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