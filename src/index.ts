import * as Path from 'path';
import {promises as FSP} from 'fs';
import {platformPaths} from 'platform-paths';
import {unusedFilename, makeSeparatorIncrementer, Incrementer} from './unusedFilename';
import {pathIsFree, formatDestinationSelection, expandTemplate, isSamePath} from './utils';
import {checksumFile} from '@tomasklaen/checksum';

export {TemplateError} from 'expand-template-literal';

/**
 * Types.
 */

export interface SaveAsPathOptions {
	destination?: string;
	deleteOriginal?: boolean;
	overwriteDestination?: boolean;
	incrementer?: 'space' | 'dash' | 'underscore' | 'parentheses';
	extraVariables?: Record<string, any>;
	onOutputPath?: (outputPath: string) => void;
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
	showChecksums?: boolean;
	extraVariables?: Record<string, string>;
}

const incrementers: Record<string, Incrementer | undefined> = {
	space: makeSeparatorIncrementer(' '),
	dash: makeSeparatorIncrementer('-'),
	underscore: makeSeparatorIncrementer('_'),
	parentheses: undefined,
};

/**
 * Drovp option schema maker.
 */
export function makeOptionSchema({extraVariables = {}}: MakeOptionSchemaOptions = {}): any {
	return {
		name: 'saving',
		type: 'namespace',
		schema: [
			{
				name: 'destination',
				type: 'path',
				kind: 'directory',
				default: '${basename}',
				title: `Destination`,
				// Appends old filename template to a newly selected directory
				formatSelection: formatDestinationSelection,
				description: `
				<p>Where to save the file. Relative path starts at the input file's directory. Template is a JavaScript template literal allowing embedded expressions.</p>
				<p><b>Available variables:</b></p>
				<p><em>Examples assume an input path <code>/foo/bar/baz.png</code>, and an output type <code>jpg</code>.</em></p>
				<p>
					<b><code>\${basename}</code></b> - <b>output</b> file basename → <code>baz.jpg</code><br>
					<b><code>\${filename}</code></b> - file name without the extension → <code>baz</code><br>
					<b><code>\${extname}</code></b> - <b>output</b> file extension with the dot → <code>.jpg</code><br>
					<b><code>\${ext}</code></b> - <b>output</b> file extension without the dot → <code>jpg</code><br>
					<b><code>\${dirname}</code></b> - directory path → <code>/foo/bar</code><br>
					<b><code>\${dirbasename}</code></b> - name of a parent directory → <code>bar</code><br>
					<b><code>\${crc32/md5/sha1/sha256/sha512}</code></b> - <b>output</b> file checksums<br>
					<b><code>\${CRC32/MD5/SHA1/SHA256/SHA512}</code></b> - uppercase <b>output</b> file checksums<br>
					${Object.entries(extraVariables)
						.map(([name, description]) => `<b><code>\${${name}}</code></b> - ${description}`)
						.join('<br>')}
				</p>
				<p>
					Platform folders:<br>
					<b><code>\${tmp}</code></b>, <b><code>\${home}</code></b>, <b><code>\${downloads}</code></b>, <b><code>\${documents}</code></b>, <b><code>\${pictures}</code></b>, <b><code>\${music}</code></b>, <b><code>\${videos}</code></b>, <b><code>\${desktop}</code></b>
				</p>
				<p>
					Utils:<br>
					<b><code>Time()</code></b> - <a href="https://day.js.org/docs/en/display/format">day.js</a> util to help with time. Example: <code>\${Time().format('YY')}</code><br>
					<b><code>uid(size? = 10)</code></b> - Unique string generator. Size is optional, default is 10. This is a faster alternative to generating file checksums when uniqueness is all that is desired. Example: <code>\${uid()}</code><br>
				</p>
				<p>
					<b>NOTE</b>: Do NOT use backslashes (<code>\\</code>) in paths. It produces cross-platform incompatible paths (can't share profile import codes) and leads to escaping issues.
				</p>
				`,
			},
			{
				name: 'deleteOriginal',
				type: 'boolean',
				default: false,
				title: `Delete original`,
				description: `Ensures the original file is deleted.`,
			},
			{
				name: 'overwriteDestination',
				type: 'boolean',
				default: false,
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
 * Save as path.
 *
 * Accepts options generated by options schema above.
 */
export async function saveAsPath(
	inputPathOrPaths: string | string[],
	tmpPath: string,
	outputExtension: string | null | undefined,
	options: SaveAsPathOptions = {}
) {
	const inputPaths = Array.isArray(inputPathOrPaths) ? inputPathOrPaths : [inputPathOrPaths];
	const firstInputPath = inputPaths[0];

	if (!firstInputPath) throw new Error(`SaveAsPath can't proceed, received empty inputPaths.`);

	// Check tmpPath exists
	try {
		await FSP.access(tmpPath);
	} catch (error) {
		throw new Error(`Temporary path "${tmpPath}" doesn't exist, or is not accessible.`);
	}

	const {deleteOriginal = false, overwriteDestination = false, incrementer: incrementerName = 'space'} = options;
	const incrementer = incrementers[incrementerName];
	const inputDirname = Path.dirname(firstInputPath);
	const template = options.destination || '${basename}';
	const extraVariables = options.extraVariables || {};

	// Query needed platform paths
	for (const name of Object.keys(platformPaths) as (keyof typeof platformPaths)[]) {
		if (template.includes(name)) extraVariables[name] = await platformPaths[name]();
	}

	// Generate checksums used in a template
	const lcTemplate = template.toLowerCase();
	for (const name of ['crc32', 'md5', 'sha1', 'sha256', 'sha512']) {
		if (lcTemplate.includes(name)) {
			const checksum = await checksumFile(tmpPath, name);
			extraVariables[name] = checksum;
			extraVariables[name.toUpperCase()] = checksum.toUpperCase();
		}
	}

	let outputPath = Path.resolve(
		inputDirname,
		expandTemplate(firstInputPath, outputExtension, {...options, destination: template, extraVariables})
	);

	/**
	 * Decides wether path can be used.
	 */
	const decider = async (path: string) => {
		const pathExists = !(await pathIsFree(path));
		const matchesInputs = inputPaths.find((inputPath) => isSamePath(path, inputPath)) != null;
		if (matchesInputs && pathExists) return deleteOriginal;
		return pathExists ? overwriteDestination : true;
	};

	outputPath = await unusedFilename(outputPath, {incrementer, decider});

	// Notify that the final path has been determined
	options.onOutputPath?.(outputPath);

	// Ensure destination directory exists
	const outputDirname = Path.dirname(outputPath);
	await FSP.mkdir(outputDirname, {recursive: true});

	// Delete inputs when options ask for it
	if (deleteOriginal) {
		for (const path of inputPaths) await FSP.rm(path, {force: true});
	}

	// Rename temporary file to outputPath
	try {
		// Attempt simple rename
		await FSP.rename(tmpPath, outputPath);
	} catch (error) {
		if ((error as any)?.code !== 'EXDEV') throw error;

		// Move across partitions/drives when necessary
		await FSP.cp(tmpPath, outputPath, {recursive: true});
		await FSP.rm(tmpPath, {recursive: true, force: true});
	}

	return outputPath;
}

/**
 * Checks wether saving options template is valid (has no errors).
 *
 * Returns `true` when valid, or throws with an error of what's wrong.
 */
export function checkSaveAsPathOptions({destination = '${basename}', extraVariables}: SaveAsPathOptions): true {
	const stubNames = ['tmp', 'home', 'downloads', 'documents', 'pictures', 'music', 'videos', 'desktop'];
	const hashes = ['crc32', 'md5', 'sha1', 'sha256', 'sha512'];
	stubNames.push(...hashes, ...hashes.map((name) => name.toUpperCase()));
	const stubs = stubNames.reduce((stubs, name) => {
		stubs[name] = `{${name}}`;
		return stubs;
	}, {} as Record<string, string>);
	expandTemplate('/mock/path/to/file.png', 'jpg', {destination, extraVariables: {...stubs, ...extraVariables}});
	return true;
}
