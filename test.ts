import test from 'ava';
import * as Path from 'path';
import {saveAsPath, checkTemplate, TemplateError, SaveAsPathOptions} from './src/index';
import * as OS from 'os';

// Fixture path
const fp = (file?: string) => Path.resolve(file ? Path.join('fixtures', file) : '.');

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

test('saveAsPath() expands path variables', async (t) => {
	t.is(await saveAsPath(fp('new.txt'), 'txt', o('${path}')), fp('new.txt'));
	t.is(await saveAsPath(fp('new.txt'), 'txt', o('${basename}')), fp('new.txt'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('${basename}')), fp('new.jpg'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('${srcbasename}')), fp('new.txt'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('${ext}')), fp('jpg'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('${srcext}')), fp('txt'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('${extname}')), fp('.jpg'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('${srcextname}')), fp('.txt'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('${filename}')), fp('new'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('${dirname}/foo')), fp('foo'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('${dirbasename}')), fp('fixtures'));
});

test('saveAsPath() uses extra variables', async (t) => {
	const extraOptions = {extraVariables: {foo: 'bar'}};
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('${foo}', extraOptions)), fp('bar'));
	await t.throwsAsync(() => saveAsPath(fp('new.txt'), 'jpg', o('${baz}', extraOptions)), {
		instanceOf: TemplateError,
		message: 'baz is not defined',
	});
});

test('saveAsPath() allows utils as extra variables', async (t) => {
	const extraOptions = {extraVariables: {foo: () => 'bar'}};
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('${foo()}', extraOptions)), fp('bar'));
});

test('saveAsPath() provides Path util', async (t) => {
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('${Path.basename(path)}')), fp('new.jpg'));
});

test('saveAsPath() provides time() util', async (t) => {
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o(`\${time().format('YYYY')}`)), fp(`${new Date().getFullYear()}`));
});

test('saveAsPath() provides uid() util', async (t) => {
	t.regex(await saveAsPath(fp('new.txt'), 'jpg', o('${uid(1)}')), /(\\|\/)\w$/);
});

test('saveAsPath() always satisfies both deleteOriginal and overwriteDestination options', async (t) => {
	t.is(await saveAsPath(fp('unique.txt'), 'jpg', o('')), fp('unique.jpg'));
	t.is(await saveAsPath(fp('unique.txt'), 'txt', o('')), fp('unique 1.txt'));
	t.is(await saveAsPath(fp('unique.txt'), 'txt', o(':d')), fp('unique.txt'));
	t.is(await saveAsPath(fp('unique.txt'), 'txt', o(':o')), fp('unique 1.txt'));
	t.is(await saveAsPath(fp('unique.txt'), 'txt', o(':do')), fp('unique.txt'));
	t.is(await saveAsPath(fp('unique.txt'), 'jpg', o(':do')), fp('unique.jpg'));
	t.is(await saveAsPath(fp('ext-conflict.txt'), 'md', o('')), fp('ext-conflict 1.md'));
	t.is(await saveAsPath(fp('ext-conflict.txt'), 'md', o(':d')), fp('ext-conflict 1.md'));
	t.is(await saveAsPath(fp('ext-conflict.txt'), 'md', o(':o')), fp('ext-conflict.md'));
	t.is(await saveAsPath(fp('ext-conflict.txt'), 'md', o(':do')), fp('ext-conflict.md'));
	t.is(await saveAsPath(fp('incremented.txt'), 'txt', o('')), fp('incremented 2.txt'));
	t.is(await saveAsPath(fp('incremented.txt'), 'txt', o(':o')), fp('incremented 1.txt'));
});

test('saveAsPath() respects configured incrementer', async (t) => {
	t.is(await saveAsPath(fp('incremented.txt'), 'txt'), fp('incremented 2.txt'));
	t.is(await saveAsPath(fp('incremented.txt'), 'txt', {incrementer: 'space'}), fp('incremented 2.txt'));
	t.is(await saveAsPath(fp('incremented.txt'), 'txt', {incrementer: 'dash'}), fp('incremented-2.txt'));
	t.is(await saveAsPath(fp('incremented.txt'), 'txt', {incrementer: 'underscore'}), fp('incremented_2.txt'));
	t.is(await saveAsPath(fp('incremented.txt'), 'txt', {incrementer: 'parentheses'}), fp('incremented (2).txt'));
});

test('saveAsPath() expands platform folders', async (t) => {
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('${tmp}/new')), Path.join(OS.tmpdir(), 'new'));
});

test('saveAsPath() generates checksums', async (t) => {
	const otherOptions = {outputPath: fp('foo.txt')};
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('${crc32}', otherOptions)), fp('8c736521'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('${md5}', otherOptions)), fp('acbd18db4cc2f85cedef654fccc4a4d8'));
	t.is(
		await saveAsPath(fp('new.txt'), 'jpg', o('${sha1}', otherOptions)),
		fp('0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33')
	);
	t.is(
		await saveAsPath(fp('new.txt'), 'jpg', o('${sha256}', otherOptions)),
		fp('2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae')
	);
	t.is(
		await saveAsPath(fp('new.txt'), 'jpg', o('${sha512}', otherOptions)),
		fp(
			'f7fbba6e0636f890e56fbbf3283e524c6fa3204ae298382d624741d0dc6638326e282c41be5e4254d8820772c5518a2c5a8c0c7f7eda19594a7eb539453e1ed7'
		)
	);
});

test('checkTemplate() returns true on valid templates', async (t) => {
	t.is(checkTemplate(o('${basename}')), true);
});

test('checkTemplate() uses extra variables', async (t) => {
	t.is(checkTemplate(o('${basename}${foo}', {extraVariables: {foo: 'bar'}})), true);
});

test('checkTemplate() throws on missing variables', async (t) => {
	const error = t.throws(() => checkTemplate(o('${foo}')), {instanceOf: TemplateError});
	t.is(error.message, 'foo is not defined');
});

test('checkTemplate() throws on syntax errors', async (t) => {
	const error = t.throws(() => checkTemplate(o('${.basename}')), {instanceOf: TemplateError});
	t.is(error.message, `Unexpected token '.'`);
});
