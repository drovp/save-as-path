import * as Path from 'path';
import unusedFilename, {separatorIncrementer, Incrementer} from 'unused-filename';
import {detokenizeAsync} from 'detokenizer';
import {platformPaths, isPlatformPathIdentifier} from 'platform-paths';

/**
 * Types.
 */

export interface SaveAsPathOptions {
	deleteOriginal: boolean;
	overwriteDestination: boolean;
	incrementer: 'space' | 'dash' | 'underscore' | 'parentheses';
	destination: string;
	tokenStart?: string;
	tokenEnd?: string;
	maxTries?: number;
	tokenReplacer?: (name: string) => string | number | null | undefined | Promise<string | number | null | undefined>;
}

export interface Options {
	[x: string]: unknown; // To silence TS
	saving: {
		destination: string;
		deleteOriginal: boolean;
		overwriteDestination: boolean;
		incrementer: 'space' | 'dash' | 'underscore' | 'parentheses';
	};
}

export interface MakeOptionSchemaOptions {
	extraTokens?: Record<string, string>;
}

/**
 * Drovp option schema maker.
 */
export function makeOptionSchema({extraTokens = {}}: MakeOptionSchemaOptions = {}): any {
	return {
		name: 'saving',
		type: 'namespace',
		schema: [
			{
				name: 'destination',
				type: 'path',
				kind: 'directory',
				default: '<basename>',
				title: `Destination`,
				description: `
				<p>Where to save the file. Relative path starts at the input file's directory.</p>
				<p><b>Available tokens:</b></p>
				<p>
					Platform folders: <code>&lt;tmp&gt;</code>, <code>&lt;home&gt;</code>, <code>&lt;downloads&gt;</code>, <code>&lt;documents&gt;</code>, <code>&lt;pictures&gt;</code>, <code>&lt;music&gt;</code>, <code>&lt;videos&gt;</code>, <code>&lt;desktop&gt;</code><br>
					<code>&lt;basename&gt;</code> - <b>result</b> file basename <code>/foo/bar.jpg</code> → <code>bar.jpg</code><br>
					<code>&lt;filename&gt;</code> - file name without the extension <code>/foo/bar.jpg</code> → <code>bar</code><br>
					<code>&lt;extname&gt;</code> - <b>result</b> file extension with the dot <code>/foo/bar.jpg</code> → <code>.jpg</code><br>
					<code>&lt;ext&gt;</code> - <b>result</b> file extension without the dot <code>/foo/bar.jpg</code> → <code>jpg</code><br>
					<code>&lt;dirname&gt;</code> - directory path <code>/foo/bar/baz.jpg</code> → <code>/foo/bar</code><br>
					<code>&lt;dirbasename&gt;</code> - name of a parent directory <code>/foo/bar/baz.jpg</code> → <code>bar</code><br>
					<code>&lt;srcBasename&gt;</code> - <b>original</b> file basename <code>/foo/bar.jpg</code> → <code>bar.jpg</code><br>
					<code>&lt;srcExtname&gt;</code> - <b>original</b> file extension with the dot <code>/foo/bar.jpg</code> → <code>.jpg</code><br>
					<code>&lt;srcExt&gt;</code> - <b>original</b> file extension without the dot <code>/foo/bar.jpg</code> → <code>jpg</code><br>
					${Object.entries(extraTokens)
						.map(([name, description]) => `<code>&lt;${name}&gt;</code> - ${description}`)
						.join('<br>')}
				</p>`,
			},
			{
				name: 'deleteOriginal',
				type: 'boolean',
				default: true,
				title: `Delete original`,
				description: `Ensures the original file is deleted.`,
			},
			{
				name: 'overwriteDestination',
				type: 'boolean',
				default: true,
				title: `Overwrite destination`,
				description: (value: boolean, {saving}: Options) =>
					saving.deleteOriginal
						? `Overwrite destination, even if it's a different file than original.`
						: `Overwrite destination, but only if it's a different file than original.`,
			},
			{
				name: 'incrementer',
				type: 'select',
				options: {
					space: 'Space: file 1',
					dash: 'Dash: file-1',
					underscore: 'Underscore: file_1',
					parentheses: 'Parentheses: file (1)',
				},
				default: 'space',
				title: `Increment style`,
				description: `What filename incrementation style to use when destination shouldn't be overwritten.`,
				isHidden: (_: string, {saving}: Options) => saving.deleteOriginal && saving.overwriteDestination,
			},
		],
	};
}

/**
 * Helpers.
 */

const incrementers: Record<string, Incrementer | undefined> = {
	space: separatorIncrementer(' '),
	dash: separatorIncrementer('-'),
	underscore: separatorIncrementer('_'),
	parentheses: undefined,
};

function normalizePath(path: string) {
	return Path.normalize(path.trim().replace(/[\\\/]+$/, ''));
}

const isWindows = process.platform === 'win32';

function isSamePath(pathA: string, pathB: string) {
	if (isWindows) {
		pathA = pathA.toLowerCase();
		pathB = pathB.toLowerCase();
	}
	return normalizePath(pathA) === normalizePath(pathB);
}

/**
 * Save as path.
 *
 * Accepts options generated by options schema above.
 */

export async function saveAsPath(
	originalPath: string,
	extension: string,
	{
		deleteOriginal = false,
		overwriteDestination = false,
		incrementer: incrementerName = 'space',
		destination = '<basename>',
		tokenStart = '<',
		tokenEnd = '>',
		maxTries = 9999,
		tokenReplacer,
	}: SaveAsPathOptions
) {
	const dirname = Path.dirname(originalPath);
	const srcExtname = Path.extname(originalPath);
	const srcBasename = Path.basename(originalPath);
	const filename = Path.basename(srcBasename, srcExtname);
	const extname = `.${extension}`;
	const basename = `${filename}${extname}`;
	const incrementer = incrementers[incrementerName];
	const pathParts: Record<string, string> = {
		srcExtname,
		srcExt: srcExtname[0] === '.' ? srcExtname.slice(1) : srcExtname,
		srcBasename,
		filename,
		dirname,
		ext: extension,
		extname,
		basename,
		dirbasename: Path.basename(dirname),
	};

	let destinationPath = await detokenizeAsync(destination, [
		[
			new RegExp(`\\${tokenStart}(?<name>[^\\${tokenEnd}]+)${tokenEnd}`),
			async (_, match) => {
				const name = match.groups?.name as string;
				console.log(name, pathParts[name]);
				if (pathParts.hasOwnProperty(name)) return pathParts[name] || '';
				if (isPlatformPathIdentifier(name)) return await platformPaths[name]({maxAge: Infinity});
				if (tokenReplacer) {
					const value = await tokenReplacer(name);
					if (value != null) return value;
				}
				throw new Error(`Unknown token "${match[0]}".`);
			},
		],
		[`\\${tokenStart}`, tokenStart],
		[`\\${tokenEnd}`, tokenEnd],
	]);

	destinationPath = Path.resolve(dirname, destinationPath);

	const samePath = isSamePath(destinationPath, originalPath);

	if (deleteOriginal) {
		if (!overwriteDestination && !samePath) {
			destinationPath = await unusedFilename(destinationPath, {incrementer, maxTries});
		}
	} else {
		destinationPath =
			!samePath && overwriteDestination
				? destinationPath
				: await unusedFilename(destinationPath, {
						incrementer,
						maxTries: samePath && overwriteDestination ? 1 : maxTries,
				  });
	}

	return destinationPath;
}
