import test from 'ava';
import * as Path from 'path';
import {saveAsPath, UnknownTokenError, SaveAsPathOptions} from './src/index';
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

test('saveAsPath() expands path tokens', async (t) => {
	t.is(await saveAsPath(fp('new.txt'), 'txt', o('<basename>')), fp('new.txt'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('<basename>')), fp('new.jpg'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('<srcBasename>')), fp('new.txt'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('<ext>')), fp('jpg'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('<srcExt>')), fp('txt'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('<extname>')), fp('.jpg'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('<srcExtname>')), fp('.txt'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('<filename>')), fp('new'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('<dirname>/foo')), fp('foo'));
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('<dirbasename>')), fp('fixtures'));
});

test('saveAsPath() expands platform folder tokens', async (t) => {
	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('<tmp>:o')), OS.tmpdir());
});

test('saveAsPath() expands custom tokens', async (t) => {
	const tokenReplacer = (name: string) => (name === 'foo' ? 'bar' : null);

	t.is(await saveAsPath(fp('new.txt'), 'jpg', {destination: '<foo>', tokenReplacer}), fp('bar'));
	await t.throwsAsync(() => saveAsPath(fp('new.txt'), 'jpg', {destination: '<baz>', tokenReplacer}), {
		instanceOf: UnknownTokenError,
		message: 'Unknown token "<baz>".',
	});
});

test('saveAsPath() expands custom async tokens', async (t) => {
	const tokenReplacer = (name: string) =>
		new Promise<string | null>((resolve) => setTimeout(() => resolve(name === 'foo' ? 'bar' : null), 1));

	t.is(await saveAsPath(fp('new.txt'), 'jpg', o('<foo>', {tokenReplacer})), fp('bar'));
	await t.throwsAsync(() => saveAsPath(fp('new.txt'), 'jpg', o('<baz>', {tokenReplacer})), {
		instanceOf: UnknownTokenError,
		message: 'Unknown token "<baz>".',
	});
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

test('saveAsPath() should respected configured incrementer', async (t) => {
	t.is(await saveAsPath(fp('incremented.txt'), 'txt'), fp('incremented 2.txt'));
	t.is(await saveAsPath(fp('incremented.txt'), 'txt', {incrementer: 'space'}), fp('incremented 2.txt'));
	t.is(await saveAsPath(fp('incremented.txt'), 'txt', {incrementer: 'dash'}), fp('incremented-2.txt'));
	t.is(await saveAsPath(fp('incremented.txt'), 'txt', {incrementer: 'underscore'}), fp('incremented_2.txt'));
	t.is(await saveAsPath(fp('incremented.txt'), 'txt', {incrementer: 'parentheses'}), fp('incremented (2).txt'));
});
