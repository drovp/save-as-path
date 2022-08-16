import * as Path from 'path';
import {promises as FSP} from 'fs';
import * as dayjs from 'dayjs';
import {expandTemplateLiteral} from 'expand-template-literal';
import {SaveAsPathOptions} from './';

const IS_WINDOWS = process.platform === 'win32';

/**
 * Check if there is nothing on the passed `path`.
 */
export async function pathIsFree(path: string) {
	try {
		await FSP.access(path);
	} catch (error) {
		if ((error as any)?.code === 'ENOENT') return true;
	}
	return false;
}

export function expandTemplate(
	inputPath: string,
	outputExtension: string | null | undefined,
	{
		destination = '${basename}',
		extraVariables,
	}: Required<Pick<SaveAsPathOptions, 'destination'>> & Pick<SaveAsPathOptions, 'extraVariables'>
) {
	const dirname = Path.dirname(inputPath);
	const srcextname = Path.extname(inputPath);
	const srcbasename = Path.basename(inputPath);
	const filename = Path.basename(srcbasename, srcextname);
	const ext = outputExtension || '';
	const extname = outputExtension ? `.${outputExtension}` : '';
	const basename = `${filename}${extname}`;
	const variables: Record<string, any> = {
		path: Path.join(dirname, basename),
		srcextname,
		srcext: srcextname[0] === '.' ? srcextname.slice(1) : srcextname,
		srcbasename,
		filename,
		dirname,
		ext,
		extname,
		basename,
		dirbasename: Path.basename(dirname),
		Time: dayjs,
		uid,
		...extraVariables,
	};

	// Expand the template
	return expandTemplateLiteral(destination, variables);
}

function normalizePath(path: string) {
	return Path.normalize(path.trim().replace(/[\\\/]+$/, ''));
}

export function isSamePath(pathA: string, pathB: string) {
	if (IS_WINDOWS) {
		pathA = pathA.toLowerCase();
		pathB = pathB.toLowerCase();
	}
	return normalizePath(pathA) === normalizePath(pathB);
}

export const uid = (size = 10) =>
	Array(size)
		.fill(0)
		.map(() => Math.floor(Math.random() * 36).toString(36))
		.join('');

export function formatDestinationSelection(path: string, oldPath: string) {
	const oldPathParts = (oldPath || '').split(/\\|\//);
	const lastOldPathPart = oldPathParts[oldPathParts.length - 1]!;
	return Path.posix.join(path.replaceAll('\\', '/'), lastOldPathPart);
}

/**
 * Escape characters with special meaning either inside or outside character sets.
 *
 * Use a simple backslash escape when it’s always valid, and a \unnnn escape when
 * the simpler form would be disallowed by Unicode patterns’ stricter grammar.
 *
 * Copy & pasted from https://github.com/sindresorhus/escape-string-regexp
 * I don't want to deal with esm<->cjs module interoperability issues in electron...
 */
export function escapeStringRegexp(string: string) {
	if (typeof string !== 'string') {
		throw new TypeError('Expected a string');
	}

	return string.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d');
}
