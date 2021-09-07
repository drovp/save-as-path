import * as Path from 'path';
import {promises as FSP} from 'fs';


/**
 * Helpers.
 */

function normalizePath(path: string) {
	return Path.normalize(path.trim().replace(/[\\\/]+$/, ''));
}

const isWindows = process.platform === 'win32';

export function isSamePath(pathA: string, pathB: string) {
	if (isWindows) {
		pathA = pathA.toLowerCase();
		pathB = pathB.toLowerCase();
	}
	return normalizePath(pathA) === normalizePath(pathB);
}

export function escapeHtml(unsafe: string) {
	return unsafe
		.replace(/&/g, '&amp;')
		.replace(/</g, '${tokenStart}')
		.replace(/>/g, '${tokenEnd}')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

export async function pathExists(path: string) {
	try {
		await FSP.access(path);
		return true;
	} catch {
		return false;
	}
}

export const regexpReplace = (str: string) => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d');

/**
 * Unused filename.
 */

export interface UnusedFilenameOptions {
	incrementer?: Incrementer;
	maxTries?: number;
	throwOnMaxTries?: boolean;
}

export type Incrementer = (filename: string, extension: string) => [string, string];

export class MaxTryError extends Error {
	originalPath: string;
	lastTriedPath: string;

	constructor(originalPath: string, lastTriedPath: string) {
		super('Max tries reached.');
		this.originalPath = originalPath;
		this.lastTriedPath = lastTriedPath;
	}
}

export function parenthesesIncrementer(inputFilename: string, extension: string): [string, string] {
	const match = inputFilename.match(/^(?<filename>.*)\((?<index>\d+)\)$/);
	let {filename, index} = match?.groups || {filename: inputFilename, index: 0};
	filename = filename.trim();
	return [`${filename}${extension}`, `${filename} (${Number(index) + 1})${extension}`];
}

export function separatorIncrementer(separator: string): Incrementer {
	const escapedSeparator = regexpReplace(separator);

	return (inputFilename: string, extension: string) => {
		const match = new RegExp(`^(?<filename>.*)${escapedSeparator}(?<index>\\d+)$`).exec(inputFilename);
		let {filename, index} = match?.groups || {filename: inputFilename, index: 0};
		return [`${filename}${extension}`, `${filename.trim()}${separator}${Number(index) + 1}${extension}`];
	};
}

function incrementPath(filePath: string, incrementer: Incrementer): [string, string] {
	const ext = Path.extname(filePath);
	const dirname = Path.dirname(filePath);
	const [originalFilename, incrementedFilename] = incrementer(Path.basename(filePath, ext), ext);
	return [Path.join(dirname, originalFilename), Path.join(dirname, incrementedFilename)];
}

export async function unusedFilename(
	filePath: string,
	{
		incrementer = parenthesesIncrementer,
		maxTries = Number.POSITIVE_INFINITY,
		throwOnMaxTries = true,
	}: UnusedFilenameOptions = {}
) {
	let tries = 0;
	let [originalPath] = incrementPath(filePath, incrementer);
	let unusedPath = filePath;

	while (true) {
		// Check if path exists
		if (!(await pathExists(unusedPath))) {
			return unusedPath;
		}

		if (++tries > maxTries) {
			if (throwOnMaxTries) throw new MaxTryError(originalPath, unusedPath);
			else return unusedPath;
		}

		[originalPath, unusedPath] = incrementPath(unusedPath, incrementer);
	}
}
