import { readFileSync } from 'fs';
import { convertContractPathToWindowFormat, convertLinuxWSLPathToWindowFormat } from '../helpers';

export class ContractManager {
	private _contractLines: string[];
	private _currentLine: number;
	private _contractSource: string;
	private _linuxFolderFormat: boolean;

	constructor() {
		this._currentLine = 0
	}

	public setOrUpdateContractSource(contractSource: string) {
		if(!this._linuxFolderFormat){
			contractSource = convertContractPathToWindowFormat(contractSource);
		}
		else {
			contractSource = convertLinuxWSLPathToWindowFormat(contractSource);
		}
		if (this._contractSource != contractSource) {
			this._contractSource = contractSource;
			this._contractLines = readFileSync(contractSource).toString().split('\n');
		}
	}

	public setContractLine(line: number) {
		this._currentLine = line;
	}

	public getSourceFile(): string {
		return this._contractSource;
	}

	public getCurrentLine(): number {
		return this._currentLine;
	}

	public getContractLines(): string[] {
		return this._contractLines;
	}

	public setLinuxFolderFormat( linuxFolderFormat: boolean ) {
		this._linuxFolderFormat = linuxFolderFormat;
	}
}