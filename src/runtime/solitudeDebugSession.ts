export interface SolitudeBreakpoint {
	fullpath: string;
	id: number;
	line: number;
	verified: boolean;
}

export class SolitudeDebugSession {
	//private _breakpointId = 1;
	//private _breakPoints = new Map<string, SolitudeBreakpoint[]>();
	private _variables: any[];
	private _variablesFrame: any[];
	private _stack: any[];


	private _breakpointFound = false;
	private _exceptionFound = false;
	private _exceptionMessage: string;

	constructor() {
		this._stack = [];
		this._variablesFrame = [];
	}

	public clearVariables() {
		this._variables = [];
	}

	public addVariable(name, type, value) {
		this._variables.push({
			name: name,
			type: type,
			value: value,
			variablesReference: 0
		});
	}

	public getVariables(variableId = 'local_0'): any {
		const frameNumber = +variableId.split('_')[1];
		if (frameNumber == 0) {
			return this._variables;
		}
		return this._variablesFrame[frameNumber];
	}

	public updateStackFrame(frames: any[]) {
		this._stack = [];
		for (let index = frames.length-1; index >= 0; index--) {
			let frame = frames.find(element => element.index == index);
			this._stack.unshift({
				index: `${frame.index}`,
				name: `${frame.description}(${1})`,
				file: `${frame.code.unitname}`,
				line: `${frame.code.line_index}`,
				invalidVariables: true
			});
		}
	}


	public addNewStackFrameIfPossible(frames: any[], contractSource: string, currentLine: number) {

		for (let index = 0; index < this._stack.length; index++) {
			this._stack[index].index = `${index + 1}`;
		}
		if (this._stack.length > 1) {
			this._stack[this._stack.length - 1].file = contractSource; //this._contractManager.getSourceFile();// this._contractSource;
			this._stack[this._stack.length - 1].line = currentLine; //this._contractManager.getCurrentLine(); // this._contractLine;
		}
		if (this._breakpointFound || this._exceptionFound) {
			this._stack = this._stack.slice(0, 2);
			this._stack[this._stack.length - 1].index = frames.length - 1
			for (let index = frames.length - 2; index > 0; index--) {
				let frame = frames.find(element => element.index == index);
				this._stack.unshift({
					index: `${frame.index}`,
					name: `${frame.description}(${1})`,
					file: contractSource,
					line: currentLine,
					invalidVariables: true
				});
				this._variablesFrame.unshift(this._variables.slice())
			}
		}
		let frame = frames.find(element => element.index == 0);
		this._stack.unshift({
			index: '0',
			name: `${frame.description}(${1})`,
			file: contractSource,
			line: currentLine,
			invalidVariables: false
		});
		this._variablesFrame.unshift(this._variables)
	}

	public updateContractSourceLineInTopStackFrame(contractSource: string, currentLine: number) {
		this._stack[0].line = currentLine;
		this._stack[0].file = contractSource;
	}

	public removeLastStackFrame() {
		this._stack.shift();
		this._variablesFrame.shift();
	}

	public getStack(): any {
		return this._stack;
	}

	public setExceptionFoundFlag() {
		this._exceptionFound = true;
	}

	public isExceptionFound() {
		return this._exceptionFound;
	}

	public setExceptionMessage(_exceptionMessage: string) {
		this._exceptionMessage = _exceptionMessage;
	}

	public getLastExceptionMessage() {
		return this._exceptionMessage;
	}
}