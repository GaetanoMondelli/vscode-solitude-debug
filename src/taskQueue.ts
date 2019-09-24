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
		this.push_step();
	}

	public processTaskQueue() {
		if (this._taskQueue.length > 0) {
			let command = this._taskQueue.shift();
			return command;
		}
		return null;
	}

	public empty() {
		this._taskQueue = [];
	}

	public isEmpty() {
		return this._taskQueue.length == 0;
	}

	public getInfo() {
		this.push_infoLocals();
		this.push_backTrace();
	}

	public step() {
		this.push_step();
		this.getInfo();
	}

	public continue() {
		this.push_continue();
		this.getInfo();
	}

	public setBreakpoint(args: string) {
		this.unshift_setBreakpoint(args);
	}

	public clearBreakpoint(args: string) {
		this.unshift_deleteBreakpoint(args);
	}

	private unshift_deleteBreakpoint(args: string) {
		this._taskQueue.unshift(_CLEAR_BREAKPOINT(args))
	}

	private unshift_setBreakpoint(args: string) {
		this._taskQueue.unshift(_SET_BREAKPOINT(args))
	}

	private push_step() {
		this._taskQueue.push(_STEP);
	}

	private push_infoLocals() {
		this._taskQueue.push(_INFOLOCALS);
	}

	private push_backTrace() {
		this._taskQueue.push(_BACKTRACE);
	}

	private push_continue() {
		this._taskQueue.push(_CONTINUE);
	}
}