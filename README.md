# @drovp/save-as-path

[Drovp](https://drovp.app) utility to determine destination path for file results. Also comes with option schema to easily plugin into your processor's profile options.

### Features

Destination as a string template with embedded expressions support (JavaScript template literals), and lot of available variables, such as all of the file path parts like `${basename}`, `${filename}`, `${extension}`, ... as well as common platform folder paths like `${downloads}`, `${documents}`, `${pictures}`, ...

Separate options to **Delete original** file and **Overwrite destination** (only or even if it's a different file than original), so that the saving destination is generated exactly to user's needs.

Configurable filename incrementation style for when the desired destination already exists, but the user configuration says it can't be overwritten.

## Install

```
npm install @drovp/save-as-path
```

## Usage

In main file, make and add options to your processor:

```js
// index.js
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

This will add `saving` namespace option item to your profile options.

Then in processor, we pass this to the `saveAsPath()` util:

```js
// processor.js
const {saveAsPath} = require('@drovp/save-as-path');
const {promises: FSP} = require('fs');

module.exports = async (payload) => {
	const {input, options} = payload;
	const destinationExtension = 'jpg';
	const destinationPath = await saveAsPath(input.path, destinationExtension, options.saving);
	const tmpPath = `${destinationPath}.tmp${Math.random().toString().slice(-6)}`;

	// Do your stuff, and save the file into `tmpPath`
	// ...
	await FSP.writeFile(tmpPath, contents);

	// Comply with `deleteOriginal` request to get rid of the input file
	if (options.saving.deleteOriginal) {
		await FSP.rm(input.path);
	}

	// Rename `tmpPath` to `destinationPath` (see IMPORTANT! below)
	await FSP.rename(tmpPath, destinationPath);
};
```

### IMPORTANT!

When `deleteOriginal` is enabled, `saveAsPath()` can generate the same file path as the original file, which might cause issues during processing, saving, or deleting when not accounted for. The best practice is to:

1. Use `saveAsPath()` to get the destination path.
    ```js
    const destinationPath = await saveAsPath(...params);
    ```
1. Make a temporary path out of it:
    ```js
    const tmpPath = `${destinationPath}.tmp${Math.random().toString().slice(-6)}`;
    ```
1. Process and save the new file into `tmpPath`.
1. If `options.deleteOriginal` is true, delete the original file.
1. Finally, rename `tmpPath` to `destinationPath`.

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

### `makeOptionSchema(options: MakeOptionSchemaOptions): OptionNamespace`

A function to construct `saving` namespace option item schema. Example:

```js
plugin.registerProcessor('foo', {
	options: [makeOptionsSchema() /* other options */],
	// ...
});
```

#### `options`

Exported as `MakeOptionSchemaOptions`.

```ts
interface MakeOptionSchemaOptions {
	showChecksums?: boolean;
	extraVariables?: Record<string, string>;
}
```

##### `showChecksums`

If you are providing `saveAsPath()` with a path to output file so it can generate and make checksums available to the template, enable this option so that the checksums documentation shows up in template description.

##### `extraVariables`

An object map with extra variable names and their descriptions if you are using any.
They'll be listed in the destination template description so that users know these tokens are available.

Example:

```js
makeOptionsSchema({
	// As used in @drovp/encode
	codec: `name of the codec used to encode the file`,
});
```

### `saveAsPath(originalPath: string, outputExtension: string, options: SaveAsPathOptions): Promise<string>`

An async function that determines the final file destination. Example:

```js
const destinationPath = await saveAsPath(payload.input.path, 'webp', payload.options.saving);
```

#### `originalPath`

Type: `string` _required_

Path to the original file to be processed.

#### `outputExtension`

Type: `string` _required_

The extension the output file should have. Can be same as the original.

#### `options`

Type: `SaveAsPathOptions` _required_

```ts
interface SaveAsPathOptions {
	destination?: string;
	deleteOriginal?: boolean;
	overwriteDestination?: boolean;
	incrementer?: 'space' | 'dash' | 'underscore' | 'parentheses';
	extraVariables?: Record<string, any>;
	outputPath?: string;
}
```

Options `destination`, `deleteOriginal`, `overwriteDestination`, and `incrementer` are provided by the `saving` option schema.

##### `destination`

Type: `string`
Default: `'${basename}'`

A desired destination template. Relative paths resolve from the original path's dirname.

Currently exposes these variables:

-   `${basename}` - **result** file basename `/foo/bar.jpg` → `bar.jpg`
-   `${filename}` - file name without the extension `/foo/bar.jpg` → `bar`
-   `${extname}` - **result** file extension with the dot `/foo/bar.jpg` → `.jpg`
-   `${ext}` - **result** file extension without the dot `/foo/bar.jpg` → `jpg`
-   `${dirname}` - directory path `/foo/bar/baz.jpg` → `/foo/bar`
-   `${dirbasename}` - name of a parent directory `/foo/bar/baz.jpg` → `bar`
-   `${srcBasename}` - **original** file basename `/foo/bar.jpg` → `bar.jpg`
-   `${srcExtname}` - **original** file extension with the dot `/foo/bar.jpg` → `.jpg`
-   `${srcExt}` - **original** file extension without the dot `/foo/bar.jpg` → `jpg`
-   Platform folders: `${tmp}`, `${home}`, `${downloads}`, `${documents}`, `${pictures}`, `${music}`, `${videos}`, `${desktop}`
-   Utilities:
    -   `Path` - reference to

You can add more variables with `extraVariables` option below.

##### `deleteOriginal`

Type: `boolean`
Default: `false`

Wether to delete the original file. The `saveAsPath()` **DOESN'T** delete any files, it will only generate a result file path that will comply with this requirement.

You have to delete the original file manually yourself after you've processed and saved the new file. See the **IMPORTANT!** note in the **Usage** section above.

##### `overwriteDestination`

Type: `boolean`
Default: `false`

Specifies wether the new path is allowed to overwrite existing files.

When enabled, it'll ignore if any file exists on the requested destination, UNLESS the `deleteOriginal` options is **disabled**, then it'll ensuring at least the original is **not** deleted.

When disabled, filename will be incremented until there's no conflict, UNLESS the `deleteOriginal` options is **enabled** and the desired result path matches the original, in which case the original path will be returned.

##### `incrementer`

Type: `'space' | 'dash' | 'underscore' | 'parentheses'`
Default: `space`

Filename incrementation style. When there's already a file on a requested destination path, and the configuration states it shouldn't be overwritten, `saveAsPath()` will increment the file name until it satisfies the configuration requirements.

Styles:

-   **space**: `file.jpg` -> `file 1.jpg`
-   **dash**: `file.jpg` -> `file-1.jpg`
-   **underscore**: `file.jpg` -> `file_1.jpg`
-   **parentheses**: `file.jpg` -> `file (1).jpg`

##### `extraVariables`

Type: `Record<string, any>` _optional_

A record of extra variables to make available inside a template. Because templates are JavaScript template literals, this can be anything including utility functions and constructors.
Allows providing your own custom destination template tokens. Accepts a token name (without the `${}` characters), and should return a string or a number.

Returning `null | undefined` is recognized as non-existent token, and results in an _Unknown token_ operation error.

Can be async.

Example:

```js
const destinationPath = await saveAsPath(item.path, 'jpg', {
	...options.saving,
	tokenReplacer: (name) => {
		if (name === 'myCustomToken') return 'token value';
	},
});
```

##### `outputPath`

Type: `string` _optional_

If you provide path to the already existing output file for which we are creating the new path for, `saveAsPath()` will be able to provide the template with file checksums as variables.

Checksums will be generated only when template uses them.

When you are passing `outputPath`, it means you are running `saveAsPath()` **after** the file has been generated, in which case it's a good practice to use `checkTemplate()` below to check if a template will produce a path and not error out due to syntax errors or misspelled variables. We don't want to spend 30 minutes encoding a file, and only then error out because template has errors.

Also, don't forget to enable `makeOptionsSchema({showChecksums: true})` so people can see checksums available in template description.

#### Returns

Promise that resolves with desired output file path.

### `checkTemplate(originalPath: string, outputExtension: string, options: SaveAsPathOptions): true`

A **synchronous** function that checks if template in options is

```js
const destinationPath = await saveAsPath(payload.input.path, 'webp', payload.options.saving);
```

### TemplateError

Error thrown when template tries to use a non-existent variable, or has syntax or runtime errors.
