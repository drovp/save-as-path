import test from 'ava';
import * as Path from 'path';
import {promises as FSP} from 'fs';
import {saveAsPath, checkSaveAsPathOptions, TemplateError, SaveAsPathOptions} from './src/index';
import * as OS from 'os';

const fixturesRoot = Path.join(OS.tmpdir(), 'save-as-path-test-fixtures');
let fixturesWorkspacesCounter = 0;

// Options shorthand
// `o('template')` => `{destination: 'template'}`
// `o('template:do')` => `{destination: 'template', deleteOriginal: true, overwriteDestination: true}`
// `o(':do')` => `{deleteOriginal: true, overwriteDestination: true}`
function o(
	shorthand: string,
	otherOptions?: Omit<SaveAsPathOptions, 'destination' | 'deleteOriginal' | 'overwriteDestination'>
) {
	const parts = shorthand.split(':');
	const [template, flags] = parts;
	return {
		destination: template || undefined,
		deleteOriginal: flags != null && flags.includes('d'),
		overwriteDestination: flags != null && flags.includes('o'),
		...otherOptions,
	};
}

/**
 * Creates fixtures workspace.
 */
function createFixtures() {
	const index = fixturesWorkspacesCounter++;
	const path = Path.join(fixturesRoot, `${index}`);

	async function setup(files: Record<string, string> | string[]) {
		await clean();
		await FSP.mkdir(path, {recursive: true});

		const filesToCreate = Array.isArray(files) ? files.map((file) => [file, ''] as const) : Object.entries(files);

		for (const [file, contents] of filesToCreate) {
			await FSP.writeFile(Path.join(path, file), contents);
		}
	}

	const getFixturePath = (file: string) => Path.join(path, file);

	const list = () => listFiles(path);

	const clean = () => FSP.rm(path, {recursive: true, force: true});

	return {setup, list, clean, path, getFixturePath, index};
}

/**
 * Lists all files in a directory recursively into a flat `['foo/bar.jpg']` like
 * alphabetically sorted array. Separator is always `/`.
 */
async function listFiles(directoryPath: string) {
	const results: string[] = [];
	const items = await FSP.readdir(directoryPath, {withFileTypes: true});

	for (const item of items) {
		if (item.isFile()) results.push(item.name);
		if (item.isDirectory()) {
			const nestedFiles = await listFiles(Path.join(directoryPath, item.name));
			results.push(...nestedFiles.map((name) => `${item.name}/${name}`));
		}
	}

	return results.sort();
}

// =====
// Tests
// =====

test.after.always('cleanup', () => FSP.rm(fixturesRoot, {recursive: true, force: true}));

test('checkSaveAsPathOptions() returns true on valid templates', async (t) => {
	t.is(checkSaveAsPathOptions(o('${basename}')), true);
});

test('checkSaveAsPathOptions() uses extra variables', async (t) => {
	t.is(checkSaveAsPathOptions(o('${basename}${foo}', {extraVariables: {foo: 'bar'}})), true);
});

test('checkSaveAsPathOptions() throws on missing variables', async (t) => {
	const error = t.throws(() => checkSaveAsPathOptions(o('${foo}')), {instanceOf: TemplateError});
	t.is(error.message, 'foo is not defined');
});

test('checkSaveAsPathOptions() throws on syntax errors', async (t) => {
	const error = t.throws(() => checkSaveAsPathOptions(o('${.basename}')), {instanceOf: TemplateError});
	t.is(error.message, `Unexpected token '.'`);
});

test(`saveAsPath() throws when tmpPath doesn't exist`, async (t) => {
	const {getFixturePath: fp} = createFixtures();
	const missingPath = fp('missing');
	await t.throwsAsync(() => saveAsPath(fp('new.txt'), missingPath, 'jpg', o('foo')), {
		message: `Temporary path "${missingPath}" doesn't exist, or is not accessible.`,
	});
});

test(`saveAsPath() renames temporary file`, async (t) => {
	const {setup, getFixturePath: fp, list} = createFixtures();
	await setup(['tmpfile']);
	t.is(await saveAsPath(fp('new.txt'), fp('tmpfile'), null, o('foo')), fp('foo'));
	t.deepEqual(await list(), ['foo']);
});

test('saveAsPath() always satisfies both deleteOriginal and overwriteDestination options', async (t) => {
	const {setup, getFixturePath: fp, list} = createFixtures();

	// Nothing exists
	// --------------

	await setup(['tmpfile']);
	t.is(await saveAsPath(fp('unique.txt'), fp('tmpfile'), 'jpg', o('')), fp('unique.jpg'));
	t.deepEqual(await list(), ['unique.jpg']);

	// Input path exists
	// -----------------

	await setup(['tmpfile', 'foo.txt']);
	t.is(await saveAsPath(fp('foo.txt'), fp('tmpfile'), 'txt', o('')), fp('foo 1.txt'));
	t.deepEqual(await list(), ['foo.txt', 'foo 1.txt'].sort());

	await setup(['tmpfile', 'foo.txt']);
	t.is(await saveAsPath(fp('foo.txt'), fp('tmpfile'), 'txt', o(':d')), fp('foo.txt'));
	t.deepEqual(await list(), ['foo.txt']);

	await setup(['tmpfile', 'foo.txt']);
	t.is(await saveAsPath(fp('foo.txt'), fp('tmpfile'), 'txt', o(':o')), fp('foo 1.txt'));
	t.deepEqual(await list(), ['foo.txt', 'foo 1.txt'].sort());

	await setup(['tmpfile', 'foo.txt']);
	t.is(await saveAsPath(fp('foo.txt'), fp('tmpfile'), 'txt', o(':do')), fp('foo.txt'));
	t.deepEqual(await list(), ['foo.txt']);

	await setup(['tmpfile', 'foo.txt']);
	t.is(await saveAsPath(fp('foo.txt'), fp('tmpfile'), 'jpg', o(':do')), fp('foo.jpg'));
	t.deepEqual(await list(), ['foo.jpg']);

	// Input & output paths exist
	// --------------------------

	await setup(['tmpfile', 'foo.txt', 'foo.jpg']);
	t.is(await saveAsPath(fp('foo.txt'), fp('tmpfile'), 'jpg', o('')), fp('foo 1.jpg'));
	t.deepEqual(await list(), ['foo.txt', 'foo.jpg', 'foo 1.jpg'].sort());

	await setup(['tmpfile', 'foo.txt', 'foo.jpg']);
	t.is(await saveAsPath(fp('foo.txt'), fp('tmpfile'), 'jpg', o(':d')), fp('foo 1.jpg'));
	t.deepEqual(await list(), ['foo.jpg', 'foo 1.jpg'].sort());

	await setup(['tmpfile', 'foo.txt', 'foo.jpg']);
	t.is(await saveAsPath(fp('foo.txt'), fp('tmpfile'), 'jpg', o(':o')), fp('foo.jpg'));
	t.deepEqual(await list(), ['foo.txt', 'foo.jpg'].sort());

	await setup(['tmpfile', 'foo.txt', 'foo.jpg']);
	t.is(await saveAsPath(fp('foo.txt'), fp('tmpfile'), 'jpg', o(':do')), fp('foo.jpg'));
	t.deepEqual(await list(), ['foo.jpg']);
});

test('saveAsPath() increments until free file is found', async (t) => {
	const {setup, getFixturePath: fp, list} = createFixtures();

	await setup(['tmpfile', 'foo', 'foo 1', 'foo 2', 'foo 3']);
	t.is(await saveAsPath(fp('foo'), fp('tmpfile'), '', o('')), fp('foo 4'));
	t.deepEqual(await list(), ['foo', 'foo 1', 'foo 2', 'foo 3', 'foo 4']);

	await setup(['tmpfile', 'foo', 'foo_1', 'foo_2', 'foo_3']);
	t.is(await saveAsPath(fp('foo'), fp('tmpfile'), '', o('', {incrementer: 'underscore'})), fp('foo_4'));
	t.deepEqual(await list(), ['foo', 'foo_1', 'foo_2', 'foo_3', 'foo_4']);

	await setup(['tmpfile', 'foo', 'foo-1', 'foo-2', 'foo-3']);
	t.is(await saveAsPath(fp('foo'), fp('tmpfile'), '', o('', {incrementer: 'dash'})), fp('foo-4'));
	t.deepEqual(await list(), ['foo', 'foo-1', 'foo-2', 'foo-3', 'foo-4']);

	await setup(['tmpfile', 'foo', 'foo (1)', 'foo (2)', 'foo (3)']);
	t.is(await saveAsPath(fp('foo'), fp('tmpfile'), '', o('', {incrementer: 'parentheses'})), fp('foo (4)'));
	t.deepEqual(await list(), ['foo', 'foo (1)', 'foo (2)', 'foo (3)', 'foo (4)']);
});

test('saveAsPath() expands path variables', async (t) => {
	const {setup, getFixturePath: fp, index} = createFixtures();

	await setup(['tmpfile']);
	t.is(await saveAsPath(fp('new.txt'), fp('tmpfile'), 'txt', o('${path}')), fp('new.txt'));
	await setup(['tmpfile']);
	t.is(await saveAsPath(fp('new.txt'), fp('tmpfile'), 'txt', o('${basename}')), fp('new.txt'));
	await setup(['tmpfile']);
	t.is(
		await saveAsPath(
			fp('new.txt'),
			fp('tmpfile'),
			'jpg',
			o('${dirbasename}-${ext}-${filename}${extname}-${basename}')
		),
		fp(`${index}-jpg-new.jpg-new.jpg`)
	);
	await setup(['tmpfile']);
	t.is(await saveAsPath(fp('new.txt'), fp('tmpfile'), 'jpg', o('${dirname}/foo')), fp('foo'));
});

test('saveAsPath() uses extra variables', async (t) => {
	const {setup, getFixturePath: fp} = createFixtures();
	const extraOptions = {extraVariables: {foo: 'bar'}};
	await setup(['tmpfile']);
	t.is(await saveAsPath(fp('new.txt'), fp('tmpfile'), 'jpg', o('${foo}', extraOptions)), fp('bar'));
	await setup(['tmpfile']);
	await t.throwsAsync(() => saveAsPath(fp('new.txt'), fp('tmpfile'), 'jpg', o('${baz}', extraOptions)), {
		instanceOf: TemplateError,
		message: 'baz is not defined',
	});
});

test('saveAsPath() allows utils as extra variables', async (t) => {
	const {setup, getFixturePath: fp} = createFixtures();
	const extraOptions = {extraVariables: {foo: () => 'bar'}};
	await setup(['tmpfile']);
	t.is(await saveAsPath(fp('new.txt'), fp('tmpfile'), 'jpg', o('${foo()}', extraOptions)), fp('bar'));
});

test('saveAsPath() provides time() util', async (t) => {
	const {setup, getFixturePath: fp} = createFixtures();
	const extraOptions = {extraVariables: {foo: () => 'bar'}};
	await setup(['tmpfile']);
	t.is(
		await saveAsPath(fp('new.txt'), fp('tmpfile'), 'jpg', o("${time().format('YYYY')}", extraOptions)),
		fp(`${new Date().getFullYear()}`)
	);
});

test('saveAsPath() provides uid() util', async (t) => {
	const {setup, getFixturePath: fp} = createFixtures();
	const extraOptions = {extraVariables: {foo: () => 'bar'}};
	await setup(['tmpfile']);
	t.regex(await saveAsPath(fp('new.txt'), fp('tmpfile'), 'jpg', o('${uid(1)}', extraOptions)), /(\\|\/)\w$/);
});

test('saveAsPath() expands platform folders', async (t) => {
	const {setup, getFixturePath: fp, path} = createFixtures();
	const fixturesTmpSubfolder = Path.relative(OS.tmpdir(), path);
	await setup(['tmpfile']);
	t.is(
		await saveAsPath(
			fp('new.txt'),
			fp('tmpfile'),
			'jpg',
			o(`\${tmp}/${fixturesTmpSubfolder.replace('\\', '/')}/new`)
		),
		fp('new')
	);
});

test('saveAsPath() generates checksums', async (t) => {
	const {setup, getFixturePath: fp} = createFixtures();
	const fooHashes = {
		crc32: '8c736521',
		md5: 'acbd18db4cc2f85cedef654fccc4a4d8',
		sha1: '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33',
		sha256: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
		sha512: 'f7fbba6e0636f890e56fbbf3283e524c6fa3204ae298382d624741d0dc6638326e282c41be5e4254d8820772c5518a2c5a8c0c7f7eda19594a7eb539453e1ed7',
	};

	for (const [name, hash] of Object.entries(fooHashes)) {
		const ucName = name.toUpperCase();
		const ucHash = hash.toUpperCase();
		await setup({tmpfile: 'foo'});
		t.is(await saveAsPath(fp('new.txt'), fp('tmpfile'), 'jpg', o(`\${${name}}`)), fp(hash), `${name} check`);
		await setup({tmpfile: 'foo'});
		t.is(await saveAsPath(fp('new.txt'), fp('tmpfile'), 'jpg', o(`\${${ucName}}`)), fp(ucHash), `${ucName} check`);
	}
});
