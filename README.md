# @drovp/save-as-path

[Drovp](https://drovp.app) utility to determine destination path for file results. Also comes with option schema to easily plugin into your processor's profile options.

### Features

Destination path template option with a lot of available replacement tokens, such as all of the file path parts like `<basename>`, `<filename>`, `<extension>`, ... as well as common platform directory paths like `<downloads>`, `<documents>`, `<pictures>`, ...

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
	const {item, options} = payload;
	const destinationExtension = 'jpg';
	const destinationPath = await saveAsPath(item.path, destinationExtension, options.saving);
	const tmpPath = `${destinationPath}.tmp${Math.random().toString().slice(-6)}`;

	// Do your stuff, and save the file into `tmpPath`
	// ...
	await FSP.writeFile(tmpPath, contents);

	// Comply with `deleteOriginal` request to get rid of the input file
	if (options.saving.deleteOriginal) {
		await FSP.rm(item.path);
	}

	// Rename `tmpPath` to `destinationPath` (see IMPORTANT! below)
	await FSP.rename(tmpPath, destinationPath);
};
```

### IMPORTANT!

Depending on input options, `saveAsPath()` can generate the same file path as the original file, which might cause issues during processing, saving, or deleting when not accounted for. The best practice is to:

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
	extraTokens?: Record<string, string>;
	tokenStart?: string;
	tokenEnd?: string;
}
```

##### `extraTokens`

An object map with extra token names and their descriptions if you are using any.
They'll be listed in the destination template description so that users know these tokens are available.

Example:

```js
makeOptionsSchema({
	// As used in @drovp/image-optimizer
	encoder: `name of the encoder used to compress the file`,
});
```

##### `tokenStart` & `tokenEnd`

Type: `string`
Default: `<` & `>`

Token start and end terminating characters. If you're customizing these when calling `saveAsPath()`, pass them here as well so that it can be reflected in option descriptions as well.

### `saveAsPath(originalPath: string, newExtension: string, options: SaveAsPathOptions): Promise<string>`

An async function that determines the final file destination. Example:

```js
const destinationPath = await saveAsPath(payload.item.path, 'webp', payload.options.saving);
```

#### `originalPath`

Type: `string` _required_

Path to the original file which we are going to process.

#### `newExtension`

Type: `string` _required_

The extension the new file should have. Can be same as the original.

#### `options`

Type: `SaveAsPathOptions` _required_

```ts
interface SaveAsPathOptions {
	destination?: string;
	deleteOriginal?: boolean;
	overwriteDestination?: boolean;
	incrementer?: 'space' | 'dash' | 'underscore' | 'parentheses';
	tokenStart?: string;
	tokenEnd?: string;
	tokenChars?: string;
	tokenReplacer?: (name: string) => string | number | null | undefined | Promise<string | number | null | undefined>;
}
```

Options `destination`, `deleteOriginal`, `overwriteDestination`, and `incrementer` are provided by the `saving` option schema. The rest is for you to customize tokens, or add more of them with `tokenReplacer`.

##### `destination`

Type: `string`
Default: `'<basename>'`

A desired destination template. Currently supports these tokens:

-   `<tmp>`, `<home>`, `<downloads>`, `<documents>`, `<pictures>`, `<music>`, `<videos>`, `<desktop>` - platform folders
-   `<basename>` - **result** file basename `/foo/bar.jpg` → `bar.jpg`
-   `<filename>` - file name without the extension `/foo/bar.jpg` → `bar`
-   `<extname>` - **result** file extension with the dot `/foo/bar.jpg` → `.jpg`
-   `<ext>` - **result** file extension without the dot `/foo/bar.jpg` → `jpg`
-   `<dirname>` - directory path `/foo/bar/baz.jpg` → `/foo/bar`
-   `<dirbasename>` - name of a parent directory `/foo/bar/baz.jpg` → `bar`
-   `<srcBasename>` - **original** file basename `/foo/bar.jpg` → `bar.jpg`
-   `<srcExtname>` - **original** file extension with the dot `/foo/bar.jpg` → `.jpg`
-   `<srcExt>` - **original** file extension without the dot `/foo/bar.jpg` → `jpg`

You can add more tokens with `tokenReplacer` option below.

##### `deleteOriginal`

Type: `boolean`
Default: `false`

Wether to delete the original file. The `saveAsPath()` **DOESN'T** delete any files, it will only generate a result file path that will comply with this requirement.

You have to delete the original file manually yourself after you've processed and saved the new file. See the **IMPORTANT!** note in the **Usage** section above.

##### `overwriteDestination`

Type: `boolean`
Default: `false`

Specifies wether the new path is allowed to overwrite existing files.

When enabled, it'll ignore if any file exists on the requested destination, UNLESS the `deleteOriginal` options is **disabled**, then it'll ensuring the original is **not** deleted.

When disabled, filename will be incremented until there's no conflict, UNLESS the `deleteOriginal` options is **enabled** and the desired result path matches the original, in which case the result path will not be increment, and will allow the original to be overwritten.

##### `incrementer`

Type: `'space' | 'dash' | 'underscore' | 'parentheses'`
Default: `space`

Filename incrementation style. When there is already a file on requested destination path, and the configuration states it shouldn't be overwritten, `saveAsPath()` will increment the file name until it satisfies the configuration requirements.

Styles:

-   **space**: `file.jpg` -> `file 1.jpg`
-   **dash**: `file.jpg` -> `file-1.jpg`
-   **underscore**: `file.jpg` -> `file_1.jpg`
-   **parentheses**: `file.jpg` -> `file (1).jpg`

##### `tokenStart` & `tokenEnd`

Type: `string`
Default: `<` & `>`

Token start and end terminating characters.

You _can_ also just disable the `tokenEnd` by passing an empty string, and set the `tokenStart` to `:` to have tokens such as `:name`, but that is prone to conflicts.

##### `tokenChars`

Type: `string`
Default: `[a-zA-Z0-9]+`

A regexp string that should match token name.

##### `tokenReplacer`

Type: `(name: string) => string | number | null | undefined | Promise<string | number | null | undefined>`

Allows providing your own custom destination template tokens. Accepts a token name (without the `<>` characters), and should return a string or a number.

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
