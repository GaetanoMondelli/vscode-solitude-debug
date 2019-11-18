export interface SolitudeBreakpoint {
	fullpath: string;
	id: number;
	line: number;
	verified: boolean;
}

export class SolitudeDebugSession {
	private _breakpointId = 1;
	private _breakPoints = new Map<string, SolitudeBreakpoint[]>();
	private _breakpointFound = false;
	private _variables: any[];
	private _variablesFrame: any[];
	private _stack: any[];
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
		for (let index = frames.length - 1; index >= 0; index--) {
			let frame = frames.find(element => element.index == index);
			this._stack.unshift({
				index: `${frame.index}`,
				name: `${frame.description}(${1})`,
				file: `${frame.code.unitname}`,
				line: frame.code.line_index,
				invalidVariables: true
			});
		}
	}

	public updateContractSourceLineInTopStackFrame(contractSource: string, currentLine: number) {
		this._stack[0].line = currentLine;
		this._stack[0].file = contractSource;
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

	public setBreakpointFoundFlag() {
		this._breakpointFound = true;
	}

	public isBreakpointFound() {
		let breakpointFound = this._breakpointFound;
		this._breakpointFound = false;
		return breakpointFound;
	}

	public getBreakpoints(path: string) {
		return this._breakPoints.get(path);
	}

	public addBreakpoint(path: string, line: number) : SolitudeBreakpoint {
		const bp = <SolitudeBreakpoint>{ fullpath: path, verified: false, line, id: this._breakpointId++};
		let bps = this.getBreakpoints(path);
		let pathArray = path.split('/');
		if (!bps) {
			bps = new Array<SolitudeBreakpoint>();
			this._breakPoints.set(pathArray[pathArray.length - 1], bps);
		}
		bps.push(bp);
		return bp;
	}

	public clearBreakpoint(path: string) : SolitudeBreakpoint | undefined {
		let bps = this._breakPoints.get(path);
		if (bps) {
			const bp = bps[0];
			bps.splice(0, 1);
			return bp;
		}
		return undefined;
	}

	public clearBreakpoints(path: string): void {
		this._breakPoints.delete(path);
	}

	public getVerifiedBreakpoints(path: string, maxContractLineIndex: number): SolitudeBreakpoint[] {
		let bps = this._breakPoints.get(path);
		let verifiedBreakpoints = new Array<SolitudeBreakpoint>();
		if (bps) {
			bps.forEach(bp => {
				if (!bp.verified && bp.line < maxContractLineIndex) {
					bp.verified = true;
					verifiedBreakpoints.push(bp);
				}
			});
		}
		return verifiedBreakpoints;
	}

}