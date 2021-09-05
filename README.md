# @drovp/save-as-path

[Drovp](https://drovp.app) utility to determine path for file results. Also comes with options type & schema for your processor profile options.

### Supports

Destination path template with a lot of predefined tokens such as all of the file path parts like `<basename>`, `<filename>`, `<extension>`, ... as well as common platform directory paths like `<downloads>`, `<documents>`, `<pictures>`, ...

Separate options to **Delete original** file and **Overwrite destination** (if it's a different file than original), so that the saving destination is generated exactly to user's needs.

Multiple filename incrementation styles for when the desired destination exists and user configuration says it can't be overwritten.

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
			makeOptionsSchema(),
			// ... other options
		],
	});
};
```

This will add `saving` property to your profile options.

Then in processor, we pass this prop to the `saveAsPath()` util:

```js
// processor.js
const {saveAsPath} = require('@drovp/save-as-path');
const {promises: FSP} = require('fs');

module.exports = async (payload) => {
	const {item, options} = payload;
	const destinationExtension = 'jpg';
	const destinationPath = await saveAsPath(item.path, destinationExtension, options.saving);

	// Do your stuff, and save the file into `destinationPath`
	// ...

	// Comply with `deleteOriginal` request to get rid of the input file
	if (options.saving.deleteOriginal) {
		await FSP.rm(item.path);
	}
};
```

### IMPORTANT!

Depending on input options, `saveAsPath()` might generate the same file path as the original file, which might cause issues during processing, saving, or deleting when not accounted for. The best practice is to:

1. Use `saveAsPath()` to get the destination path.
    ```js
    const destinationPath = await saveAsPath(...params);
    ```
1. Make a temporary path out of it:
    ```js
    const tmpPath = `${destinationPath}.tmp${Math.random().toString().slice(-5)}`;
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

// ... rest of the main file config
```

## API

All exported interfaces.

### `Options`

Options data type the `makeOptionSchema()` will produce on your options object:

```ts
interface Options {
	saving: {
		destination: string; // Destination template
		deleteOriginal: boolean;
		overwriteDestination: boolean;
		incrementer: 'space' | 'dash' | 'underscore' | 'parentheses';
	};
}
```

### `makeOptionSchema(options: MakeOptionSchemaOptions): OptionNamespace`

A function to construct `saving` option namespace item to be passed directly to your processor options schema array. Example:

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
}
```

##### `extraTokens`

An object map with extra token names and their descriptions if you are using any.
This will be displayed in the custom destination template description so that users know these tokens are available.

Example:

```js
makeOptionsSchema({
	// used by @drovp/image-optimizer
	encoder: `name of the encoder used to compress the file`,
});
```

### `saveAsPath(originalPath: string, newExtension: string, options: SaveAsPathOptions): Promise<string>`

An async function that determines the final file destination. Example:

```js
const destinationPath = await saveAsPath(payload.item.path, 'webp', payload.options.saving);
```

#### `originalPath`

Type: `string` _required_

Path to the original file which we are trying to either replace, or create a new one out of.

#### `newExtension`

Type: `string` _required_

An extension the new file should have. Can be same as the original.

#### `options`

Type: `SaveAsPathOptions` _required_

```ts
interface SaveAsPathOptions {
	deleteOriginal?: boolean;
	overwriteDestination?: boolean;
	incrementer?: 'space' | 'dash' | 'underscore' | 'parentheses';
	destination?: string;
	tokenReplacer?: (name: string) => string | number | null | undefined | Promise<string | number | null | undefined>;
}
```

All options except the `tokenReplacer` are provided by the `saving` option schema. The `tokenReplacer` is for you if you wish to provide extra tokens for replacement.

##### `deleteOriginal`

Type: `boolean`
Default: `false`

Wether to delete the original file. The `saveAsPath()` **DOESN'T** delete any files, it will only generate a result file path that will comply with this requirement.

You have to delete the original file manually yourself after you've processed and saved the new file. See the **IMPORTANT!** section above.

##### `overwriteDestination`

Type: `boolean`
Default: `false`

Specifies wether the new path is allowed to overwrite existing files. When enabled, it'll ignore if any file exists on the requested destination, UNLESS the `deleteOriginal` options is **disabled**, then it'll check if the destination matches the original, and if so, it'll increment it's filename by 1, ensuring the original is **not** deleted.

##### `incrementer`

Type: `'space' | 'dash' | 'underscore' | 'parentheses'`
Default: `space`

Filename incrementation style. When there is already a file on requested destination path, and the configuration states it shouldn't be overwritten, `saveAsPath()` will increment the file name until it satisfies the configuration requirements.

Styles:

- `space` - `file.jpg` -> `file 1.jpg`
- `dash` - `file.jpg` -> `file-1.jpg`
- `underscore` - `file.jpg` -> `file_1.jpg`
- `parentheses` - `file.jpg` -> `file (1).jpg`
