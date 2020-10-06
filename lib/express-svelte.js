'use strict';

const Utils = require('./utils');
const Renderer = require('./renderer');

const ERROR_EXPRESS_SVELTE_LOOKUP = 'ERROR_EXPRESS_SVELTE_LOOKUP';

const VIEW_GLOBALS_COMPONENT_FILENAME = __dirname + '/components/ViewGlobals.svelte';

const DEFAULT_VIEWS_DIRNAME = '/views';
const DEFAULT_BUNDLES_DIRNAME = '/public/dist';
const DEFAULT_BUNDLES_PATTERN = '[name]-[hash][extname]';
const DEFAULT_BUNDLES_HOST = '';
const DEFAULT_EXTENSION = '.svelte';

/**
 * @param {ExpressSvelteOptions} opts
 * @return {Function}
 */
function expressSvelte(opts = {}) {

    let viewsDirname = opts.viewsDirname || process.cwd() + DEFAULT_VIEWS_DIRNAME;
    viewsDirname = Array.isArray(viewsDirname) ? viewsDirname : [viewsDirname];

    let defaultExtension = opts.defaultExtension || DEFAULT_EXTENSION;
    defaultExtension = defaultExtension[0] !== '.' ? '.' + defaultExtension : defaultExtension;

    let bundlesDirnames = opts.bundlesDirname || process.cwd() + DEFAULT_BUNDLES_DIRNAME
    bundlesDirnames = Array.isArray(bundlesDirnames) ? bundlesDirnames : [bundlesDirnames];

    let bundlesPattern = opts.bundlesPattern || DEFAULT_BUNDLES_PATTERN;
    let bundlesHost = opts.bundlesHost || DEFAULT_BUNDLES_HOST;

    const bundlesRegExp = Utils.getFilenameRegExp(bundlesPattern);
    const bundlesFilenames = bundlesDirnames.map(Utils.getFilenames).flat();

    const { scriptsMap, stylesMap } = Utils.getFilenamesMaps(bundlesFilenames, bundlesRegExp);

    return function expressSvelteMiddleware(req, res, next) {

        /**
         * @param {String}  name
         * @param {Object}  options
         * @param {Object}  options.props
         * @param {Object}  options.globalProps
         * @param {Object}  options.globalStore
         * @param {String=} options.templateString
         * @param {String=} options.templateFilename
         */
        res.svelte = async function svelte(name, options = {}) {
            try {
                const { req, app } = this;

                // Lookup view with express view engine like logic
                const filename = await Utils.lookup(name, viewsDirname, defaultExtension);

                if (filename == null) {
                    const err = new Error(`Failed to lookup view "${name}" in views directories ${JSON.stringify(viewsDirname)}`);
                    err.code = ERROR_EXPRESS_SVELTE_LOOKUP;
                    req.next(err);
                    return;
                }

                // Get component props
                const componentProps = options.props || {};

                // Serialize global props with express view engine like logic
                const globalProps = options.globalProps || {};
                const serializedGlobalProps = Utils.getSerializedProps('$globalProps', app.locals, req.locals, res.locals, globalProps);

                // Serialize global store with express view engine like logic
                const globalStore = options.globalStore || {};
                const serializedGlobalStore = Utils.getSerializedProps('$globalStore', app.locals, req.locals, res.locals, globalStore);

                // Compile component with middleware options
                const ViewGlobals = Renderer.compile(VIEW_GLOBALS_COMPONENT_FILENAME, opts);
                const ViewComponent = Renderer.compile(filename, opts);

                // Render component
                const { head, html, css } = ViewGlobals.render({
                    globalAssets: {
                        host: bundlesHost,
                        scripts: scriptsMap,
                        styles: stylesMap
                    },
                    globalProps: serializedGlobalProps,
                    globalStore: serializedGlobalStore,
                    component: ViewComponent,
                    componentProps
                });

                // TODO: Devalue serialized props and store

                // Renderer str
                const str = '';

                this.send(str);
            }
            catch(err) {
                // TODO: Wrap compile or render to raise errors with codes ?
                // TODO: Is this the right way to handle this errors ?
                req.next(err);
            }
        };

        next();
    }
}

/**
 * @typedef {RenderBaseOptions} ExpressSvelteOptions
 *
 * @property {String|String[]} [viewsDirname]                   Defaults to process.cwd() + "/views".
 *                                                              A directory or an array of directories for the app's views (svelte files).
 *
 * @property {String|String[]} [bundlesDirname]                 Defaults to process.cwd() + "/public/dist".
 *                                                              A directory or an array of directories for the app's views compiled bundles (js and css files).
 *
 * @property {String}          [bundlesPattern]                 Defaults to "[name]-[hash][extname]".
 *                                                              Bundles output format.
 *                                                              [name] can be used for easy reference.
 *
 * @property {String}          [bundlesHost]                    Optional host to prefix bundles or CSS. Eg, a CDN host or different subdomain.
 * @property {String}          [defaultExtension = '.svelte']
 *
 * @property {String}          [templateString]                 It has precedence over templateFilename.
 * @property {String}          [templateFilename]
 */

/**
 * @typedef {RenderBaseOptions} ExpressSvelteRenderOptions
 */

/**
 * @typedef {Object} RenderBaseOptions
 *
 * @property {Boolean}   [env]                 Defaults to process.env.NODE_ENV.
 *                                             Used to determine [dev] and [cache] values if not set.
 *                                             It replaces "process.env.NODE_ENV" with "@rollup/plugin-replace" plugin.
 *
 * @property {Boolean}   [dev]                 Default is inferred with env. (If [env] is "development" or "testing" is set to true).
 *                                             It sets [dev], [preserveComments] and [preserveWhitespace] with true at "rollup-plugin-svelte" plugin
 *                                             and enables source map support
 *
 * @property {Boolean}   [cache]               Default is inferred with env. (If [env] is "development" or "testing" is set to true).
 *
 * @property {Boolean}   [hydratable = true]   Defaults to true.
 *
 * @property {Object}    [replace = {}]        Object of keys to be replaced with "@rollup/plugin-replace" plugin.
 *
 * @property {Array}     [preprocess = []]     Preprocess array to be used at "rollup-plugin-svelte" plugin
 */

module.exports = expressSvelte;