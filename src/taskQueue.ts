// SOLITUDE CLI COMMANDS

const _STEP = { command: "step", args: "" };
const _INFOLOCALS = { command: "info_locals", args: "" };
const _BACKTRACE = { command: "backtrace", args: "" };
const _CONTINUE = { command: "continue", args: "" };
const _SET_BREAKPOINT = (args: string) => { return { "command": "break", "args": [args] } };
const _CLEAR_BREAKPOINT = (args: string) => { return { "command": "delete", "args": [args] } };

export class TaskQueue {
	private _taskQueue: any[];

	constructor() {
		this._taskQueue = [];
		this._taskQueue.push(_STEP);
	}

	public processTaskQueue() {
		if (this._taskQueue.length > 0) {
			let command = this._taskQueue.shift();
			return command;
		}
		return null;
	}

	public isEmpty() {
		return this._taskQueue.length == 0;
	}

	public empty() {
		this._taskQueue = [];
	}

	public getInfoCommand() {
		this._taskQueue.push(_INFOLOCALS);
		this._taskQueue.push(_BACKTRACE);
	}

	public stepCommand() {
		this._taskQueue.push(_STEP);
		this.getInfoCommand();
	}

	public continueCommand() {
		this._taskQueue.push(_CONTINUE);
		this.getInfoCommand();
	}

	public setBreakpointCommand(path: string, line: number) {
		let pathArray = path.split('/');
		let args = pathArray[pathArray.length - 1] + ':' + line;
		this._taskQueue.unshift(_SET_BREAKPOINT(args));
	}

	public setFunctionBreakpointCommand(functionName: string) {
		this._taskQueue.unshift(_SET_BREAKPOINT(functionName));
	}

	public clearBreakpointCommand(args: string) {
		this._taskQueue.unshift(_CLEAR_BREAKPOINT(args))
	}
}
