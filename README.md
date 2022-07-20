# @drovp/save-as-path

[Drovp](https://drovp.app) plugin utility to help plugins provide users with powerful output path determination interface. Also comes with option schema to easily plugin into your processor's profile options.

### Features

Destination option is a string template with embedded expressions support (JavaScript template literals), with access to a lot of useful variables, such as all of the file path parts like `${basename}`, `${filename}`, `${extension}`, ... as well as common platform folder paths like `${downloads}`, `${documents}`, `${pictures}`, ..., and output file checksums `${crc32}`, `${md5}`, ...

You can also extend the available variables with extra ones. You can even pass functions or other utilities.

Separate options to **Delete original** file and **Overwrite destination** (only or even if it's a different file than original), so that the saving destination is generated exactly to user's needs.

Configurable filename incrementation style for when the desired destination already exists, but the user configuration says it can't be overwritten.

## Install

```
npm install @drovp/save-as-path
```

## Usage

In main file, make and add save-as-path option namespace item to your processor options schema:

```js
// Main plugin file (index.js)
const {makeOptionSchema} = require('@drovp/save-as-path');

module.exports = (plugin) => {
	plugin.registerProcessor('name', {
		// ...
		options: [
			makeOptionSchema(),
			// ... other options
		],
	});
};
```

This will add `saving` namespace to your profile options, ready to be passed to `saveAsPath()` inside your processor to handle all the tedious renaming related stuff for you:

```js
// processor.js
const {saveAsPath, checkSaveAsPathOptions, TemplateError} = require('@drovp/save-as-path');
const {promises: FSP} = require('fs');

module.exports = async (payload, utils) => {
	const {input, options} = payload;
	const outputExtension = 'jpg';
	const tmpPath = `${input.path}.tmp${Math.random().toString().slice(-6)}`;

	// First, we check that options have a valid template.
	// This is so that invalid options throw an error BEFORE we potentially
	// spend half an hour creating a new file, and not afterwards.
	try {
		checkSaveAsPathOptions(options.saving);
	} catch (error) {
		if (error instanceof TemplateError) {
			utils.output.error(`Destination template error: ${error.message}`);
			return;
		}
	}

	// We create a new file at a unique temporary path
	await FSP.writeFile(tmpPath, 'new file contents');

	// We let saveAsPath handle deleting the original file (when requested by
	// options), and renaming the new one.
	const outputPath = await saveAsPath(input.path, tmpPath, outputExtension, options.saving);

	// We emit a new file
	utils.output.file(outputPath);
};
```

### TypeScript

In TypeScript, you can import `Options` type and extend your options with it:

```js
import {PayloadData} from '@drovp/types';
import {Options as SaveAsOptions} from '@drovp/save-as-path';

type Options = SaveAsOptions & {
	myOther: string,
	options: boolean,
};

export type Payload = PayloadData<Options>;

// ... rest of the main file
```

## API

All exported interfaces.

### `Options`

Options data type the `makeOptionSchema()` will produce on your options object:

```ts
interface Options {
	saving: {
		destination: string;
		deleteOriginal: boolean;
		overwriteDestination: boolean;
		incrementer: 'space' | 'dash' | 'underscore' | 'parentheses';
	};
}
```

### `makeOptionSchema(options?): OptionNamespace`

A function to construct `saving` namespace option item schema. Example:

```js
plugin.registerProcessor('foo', {
	options: [
		makeOptionsSchema(),
		/* other options */
	],
	// ...
});
```

#### `options`

Type: `MakeOptionSchemaOptions`

```ts
interface MakeOptionSchemaOptions {
	extraVariables?: Record<string, string>;
}
```

##### `extraVariables`

An object map with extra variable names and their descriptions if you are using any.
They'll be listed in the destination template description so that users know these tokens are available.

Example:

```js
makeOptionsSchema({
	extraVariables: {
		// As used in @drovp/encode
		codec: `name of the codec used to encode the file`,
	},
});
```

### `saveAsPath(inputPath, tmpPath, outputExtension, options?): Promise<string>`

An async function that determines the final file destination, and handles all the renaming, deleting, or copying between partitions/drives. Example:

```js
const outputPath = await saveAsPath(payload.input.path, 'tmpfile1e44', 'webp', payload.options.saving);
```

#### `inputPath`

Type: `string` _required_

Path to the original file that has been processed. This path doesn't have to exist anymore, `saveAsPath()` only uses it to extract path related variables to be used in a template.

Though when **deleteOriginal** option is enabled, `saveAsPath()` will ensure it's deleted before renaming or deciding the new file name.

#### `tmpPath`

Type: `string` _required_

Temporary path that holds now finished output file. This is used to generate checksum variables for templates (only when templates need it), and than it'll be renamed according to the template and other saving options.

#### `outputExtension`

Type: `string | null | undefined` _required_

The extension the output file should have. Can be same as the original, or none.

#### `options`

Type: `SaveAsPathOptions` _optional_

```ts
interface SaveAsPathOptions {
	destination?: string;
	deleteOriginal?: boolean;
	overwriteDestination?: boolean;
	incrementer?: 'space' | 'dash' | 'underscore' | 'parentheses';
	extraVariables?: Record<string, any>;
	onOutputPath?: (outputPath: string) => void;
}
```

Options `destination`, `deleteOriginal`, `overwriteDestination`, and `incrementer` are provided by the `saving` option schema.

##### `destination`

Type: `string`
Default: `'${basename}'`

A desired destination template. Relative paths resolve from the original path's dirname.

Currently exposes these variables:

_Examples assume **inputPath** `/foo/bar/baz.png` and **outputExtension** `jpg`._

-   **`${basename}`** - **result** file basename → `baz.jpg`
-   **`${filename}`** - file name without the extension → `baz`
-   **`${extname}`** - **result** file extension with the dot → `.jpg`
-   **`${ext}`** - **result** file extension without the dot → `jpg`
-   **`${dirname}`** - directory path → `/foo/bar`
-   **`${dirbasename}`** - name of a parent directory → `baz`
-   **`${srcBasename}`** - **original** file basename → `baz.jpg`
-   **`${srcExtname}`** - **original** file extension with the dot → `.jpg`
-   **`${srcExt}`** - **original** file extension without the dot → `jpg`
-   **`${crc32/md5/sha1/sha256/sha512}`** - **output** file checksums
-   **`${CRC32/MD5/SHA1/SHA256/SHA512}`** - uppercase **output** file checksums
-   Platform folders: **`${tmp}`**, **`${home}`**, **`${downloads}`**, **`${documents}`**, **`${pictures}`**, **`${music}`**, **`${videos}`**, **`${desktop}`**
-   Utilities:
    -   **`Time()`** - [day.js](https://day.js.org/docs/en/display/format) util to help with time. Example: `${Time().format('YY')}`
    -   **`UID(size? = 10)`** - unique string generator, size is optional, default is 10. Example: `${UID()}`

You can add more variables with `extraVariables` option below.

##### `deleteOriginal`

Type: `boolean`
Default: `false`

Wether to delete the original file.

##### `overwriteDestination`

Type: `boolean`
Default: `false`

Specifies wether the new path is allowed to overwrite existing files.

When enabled, it'll overwrite any existing file on the requested destination, UNLESS the `deleteOriginal` options is **disabled**, then it'll ensuring at least the original is **not** deleted.

When disabled, filename will be incremented until there's no conflict, UNLESS the `deleteOriginal` options is **enabled** and the desired result path matches the original, in which case the file will simply replace the original.

##### `incrementer`

Type: `'space' | 'dash' | 'underscore' | 'parentheses'`
Default: `space`

Filename incrementation style. When there's already a file on a requested destination path, and the configuration states it shouldn't be overwritten, `saveAsPath()` will increment the filename until it satisfies the configuration requirements.

Styles:

-   **space** → `file 1.jpg`
-   **dash** → `file-1.jpg`
-   **underscore** → `file_1.jpg`
-   **parentheses** → `file (1).jpg`

##### `extraVariables`

Type: `Record<string, any>` _optional_

An object with extra variables that should be available in a template. Because templates are JavaScript template literals, this can be anything including utility functions and constructors.

In this example, template `${foo} ${baz()}` will generate `'bar something else'`:

```js
const outputPath = await saveAsPath(input.path, tmpPath, 'jpg', {
	...options.saving,
	extraVariables: {
		foo: 'bar',
		baz: () => 'something else',
	},
});
```

##### `onOutputPath`

Type: `(outputPath: string) => void` _optional_

An event triggered right after the `outputPath` has been determined. Sometimes, new path might be on a different partition/drive than the temporary file, and if the file is big, it'll take a second to transfer, but you might want to log that this operation is happening before it starts.

#### Returns

Promise that resolves with output file path.

### `checkSaveAsPathOptions(options): true`

A **synchronous** function that checks if template in options is not trying to use non-existent variables, or has any syntax or runtime errors.

This is so that invalid options throw an error BEFORE we potentially spend half an hour creating a new file, and not afterwards.

```js
checkSaveAsPathOptions(payload.options.saving);
```

#### `options`

Type: `SaveAsPathOptions` _required_

Same options you intend to pass to `saveAsPath()` later.

#### Returns

Returns `true` if options look all right, or throws `TemplateError` with message of what is wrong with them.

### TemplateError

Error thrown when template tries to use a non-existent variable, or has a syntax or runtime errors.
