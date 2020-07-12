import { readFileSync } from 'fs';

export function convertPathToWindowFormat(path): string {
	// path example: /c:/Users/user/dev/solitude-examples/examples/e04_erc20_debug/solitude.yaml
	let replacement = '\\';
	let winPath = path.replace(/\//g, replacement);
	return winPath = winPath.slice(1);
}

export function convertContractPathToWindowFormat(path): string {
	// path example: /c:/Users/user/dev/solitude-examples/examples/e04_erc20_debug/solitude.yaml
	let messageArray = path.split("/");
	messageArray = messageArray.slice(1);
	messageArray[0] += ':';
	return messageArray.join("\\");
}

export function convertLinuxWSLPathToWindowFormat(path): string {
	// path example: /C/Users/gaeta/Documents/dev/solitude-examples/examples/e04_erc20_debug/MyToken.sol
	try {
		readFileSync(path)
		return path;
	} catch {
		//WSL
		path = '/mnt' + path;
		let messageArray = path.split("/");
		messageArray[2] = messageArray[2].toLowerCase();
		return messageArray.join('/');
	}
}

export function convertOSPathToWindowFormat(path): string {
	// path example: c:\\mnt\\c\\Users\\gaeta
	let messageArray = path.split("\\");
	path = messageArray.splice(2).join('\\');
	return path;
}
