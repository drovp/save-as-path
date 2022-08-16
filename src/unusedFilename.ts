import * as Path from 'path';
import {pathIsFree, escapeStringRegexp} from './utils';

/**
 * Returns `[originalFilename, incrementedFilename]` tuple.
 */
export interface Incrementer {
	(inputFilename: string, extension: string): [string, string];
}

/**
 * Should return `true` when path is free to use.
 */
export interface Decider {
	(path: string): Promise<boolean>;
}

export class MaxTryError extends Error {
	originalPath: string;
	lastTriedPath: string;

	constructor(originalPath: string, lastTriedPath: string) {
		super('Max tries reached.');
		this.originalPath = originalPath;
		this.lastTriedPath = lastTriedPath;
	}
}

const parenthesesIncrementer: Incrementer = (inputFilename: string, extension: string) => {
	const match = inputFilename.match(/^(?<filename>.*)\((?<index>\d+)\)$/);
	let {filename, index} = match
		? (match.groups as {filename: string; index: string})
		: {filename: inputFilename, index: '0'};
	let indexNum = parseInt(index, 10);
	filename = filename.trim();
	return [`${filename}${extension}`, `${filename} (${++indexNum})${extension}`];
};

export const makeSeparatorIncrementer: (separator: string) => Incrementer = (separator) => {
	const escapedSeparator = escapeStringRegexp(separator);

	return (inputFilename, extension) => {
		const match = new RegExp(`^(?<filename>.*)${escapedSeparator}(?<index>\\d+)$`).exec(inputFilename);
		let {filename, index} = match
			? (match.groups as {filename: string; index: string})
			: {filename: inputFilename, index: '0'};
		let indexNum = parseInt(index, 10);
		return [`${filename}${extension}`, `${filename.trim()}${separator}${++indexNum}${extension}`];
	};
};

const incrementPath = (filePath: string, incrementer: Incrementer): [string, string] => {
	const ext = Path.extname(filePath);
	const dirname = Path.dirname(filePath);
	const [originalFilename, incrementedFilename] = incrementer(Path.basename(filePath, ext), ext);
	return [Path.join(dirname, originalFilename), Path.join(dirname, incrementedFilename)];
};

export async function unusedFilename(
	filePath: string,
	{
		incrementer = parenthesesIncrementer,
		maxTries = Number.POSITIVE_INFINITY,
		decider = pathIsFree,
	}: {incrementer?: Incrementer; maxTries?: number; decider?: Decider} = {}
) {
	let tries = 0;
	let [originalPath] = incrementPath(filePath, incrementer);
	let unusedPath = filePath;

	while (true) {
		if (await decider(unusedPath)) return unusedPath;
		if (++tries > maxTries) throw new MaxTryError(originalPath, unusedPath);
		[originalPath, unusedPath] = incrementPath(unusedPath, incrementer);
	}
}
