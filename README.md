# RenpyTranslation

A web application for translating Ren'Py game scripts using various translation APIs.

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 19.2.9.

## Development server

To start a local development server, run:

```bash
npm start
```

This starts the Angular development server with the built-in proxy configuration to handle CORS issues when making requests to translation APIs.

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project, run:

```bash
npm run build
```

This command will compile your project and store the build artifacts in the `dist/` directory.

## Available Scripts

The following npm scripts are available:

- `npm start` - Start Angular dev server with proxy configuration
- `npm run build` - Build Angular application
- `npm run watch` - Build Angular application and watch for changes
- `npm test` - Run tests

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Proxy Configuration

The Angular development server proxies requests to the following APIs:

- DeepL Free API: `/deepl-api` → `https://api-free.deepl.com`
- DeepL Pro API: `/deepl-pro-api` → `https://api.deepl.com`
- Azure Translator API: `/azure-api` → `https://api.cognitive.microsofttranslator.com`

Note: The Google Translate (Free) API is accessed directly without using a proxy. See the "Google Translate (Free)" section for more details.

## Google Translate (Free)

The application now supports Google Translate's undocumented API, which is free to use and doesn't require an API key. This option is available in the API selector dropdown as "Google Translate (Free)".

The application makes direct requests to the Google Translate API using the following URL format:

```
https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=fr&dt=t&q=Hello%20World
```

Where:

- `client=gtx` - Identifies the request as coming from a browser
- `sl=auto` - Source language (auto for auto-detection)
- `tl=fr` - Target language (fr for French, en for English, etc.)
- `dt=t` - Data type (t for translation)
- `q=Hello%20World` - The text to translate (URL encoded)

**Important Notes:**

- This is an undocumented API and not officially supported by Google
- It may have usage limitations or be subject to change without notice
- You may encounter CORS issues when making direct requests to this API from a browser
- It's recommended for personal or development use only

## DeepL API URLs

When using DeepL translation services, it's important to use the correct URL based on your account type:

- **DeepL Free API**: `https://api-free.deepl.com`
- **DeepL Pro API**: `https://api.deepl.com`

The application automatically detects which URL to use based on your API key. If your API key includes the `:fx` suffix (e.g., `your-api-key:fx`), the free API URL will be used.

## Troubleshooting

If you encounter issues with the translation APIs:

1. Check that your API key is correct (not needed for Google Translate Free)
2. For DeepL Free API keys, make sure to include the `:fx` suffix (e.g., `your-api-key:fx`)
3. If you're experiencing CORS issues with Google Translate (Free), you may need to:
  - Use a CORS proxy service
  - Set up your own proxy server
  - Use a browser extension that disables CORS for development purposes
4. If Google Translate (Free) returns unexpected results or errors, it might be due to:
  - Usage limitations or rate limiting by Google
  - Changes in the undocumented API
  - IP-based restrictions
5. Check the browser console for detailed error information

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
