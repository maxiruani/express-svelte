'use strict';

const Utils = require('./utils');
const ServerViewFactory = require('./server-view-factory');

const ERROR_EXPRESS_SVELTE_LOOKUP = 'ERROR_EXPRESS_SVELTE_LOOKUP';
const ERROR_EXPRESS_SVELTE_COMPILE = 'ERROR_EXPRESS_SVELTE_COMPILE';
const ERROR_EXPRESS_SVELTE_RENDER = 'ERROR_EXPRESS_SVELTE_RENDER';

const TEMPLATE_FILENAME = __dirname + '/data/template.html';

const DEFAULT_VIEWS_DIRNAME = '/views';
const DEFAULT_BUNDLES_DIRNAME = '/public/dist';
const DEFAULT_BUNDLES_PATTERN = '[name]-[hash][extname]';
const DEFAULT_BUNDLES_HOST = '/public/dist';
const DEFAULT_EXTENSION = '.svelte';

const NODE_ENV = process.env.NODE_ENV;
const NODE_ENV_DEVELOPMENT = 'development';
const NODE_ENV_TESTING = 'testing';

/**
 * @param {ExpressSvelteOptions} opts
 * @return {Function}
 */
function expressSvelte(opts = {}) {

    let viewsDirname = opts.viewsDirname || process.cwd() + DEFAULT_VIEWS_DIRNAME;
    viewsDirname = Array.isArray(viewsDirname) ? viewsDirname : [viewsDirname];

    let defaultExtension = opts.defaultExtension || DEFAULT_EXTENSION;
    defaultExtension = defaultExtension[0] !== '.' ? '.' + defaultExtension : defaultExtension;

    let bundlesDirnames = opts.bundlesDirname || process.cwd() + DEFAULT_BUNDLES_DIRNAME;
    bundlesDirnames = Array.isArray(bundlesDirnames) ? bundlesDirnames : [bundlesDirnames];
    bundlesDirnames = Utils.resolveDirnames(bundlesDirnames);

    let bundlesPattern = opts.bundlesPattern || DEFAULT_BUNDLES_PATTERN;
    let bundlesHost = opts.bundlesHost || DEFAULT_BUNDLES_HOST;

    // Scan bundles directories and get all js and css files synchronous
    const bundlesRegExp = Utils.getFilenameRegExp(bundlesPattern);
    const bundlesFilenames = bundlesDirnames.map(Utils.getFilenamesSync).flat();

    // Build script and styles maps based on scanned bundles
    const { scriptsMap, stylesMap } = Utils.getFilenamesMaps(bundlesFilenames, bundlesRegExp, bundlesDirnames);

    const env = opts.env || NODE_ENV || NODE_ENV_DEVELOPMENT;
    const dev = opts.dev != null ? opts.dev : env === NODE_ENV_DEVELOPMENT || env === NODE_ENV_TESTING;
    const cache = opts.cache != null ? opts.cache : dev === false;
    const legacy = opts.legacy || false;

    const _compileOptions = {
        env,
        dev,
        cache,
        hydratable: opts.hydratable || false,
        replace: opts.replace || {},
        preprocess: opts.preprocess || [],
        dedupe: opts.dedupe || []
    };

    const _templateOptions = {
        env,
        dev,
        cache
    };

    // Clear tmp dir and create if not exists synchronous
    ServerViewFactory.clear();

    /**
     * @param {String} name
     * @param {ExpressSvelteRenderOptions=} renderOptions
     */
    async function svelte(name, renderOptions = {}) {
        const { req, app } = this;
        const { res } = req;

        try {
            // Lookup view with express view engine like logic
            const filename = await Utils.lookup(name, viewsDirname, defaultExtension);

            if (filename == null) {
                const err = new Error(`Failed to lookup view "${name}" in views directories ${JSON.stringify(viewsDirname)}`);
                err.code = ERROR_EXPRESS_SVELTE_LOOKUP;
                return req.next(err);
            }

            // Get view filename key to be able to get view script if exists
            const filenameKey = Utils.getRelativeFilenameKey(filename, viewsDirname);

            // Get component, global and store props with express like logic
            const props = renderOptions.props || {};
            const globalProps = Utils.getSerializedProps('$globalProps', app.locals, req.locals, res.locals, renderOptions.globalProps);
            const globalStore = Utils.getSerializedProps('$globalStore', app.locals, req.locals, res.locals, renderOptions.globalStore);

            // Created and compile wrapped view component
            let WrappedViewComponent = null;

            try {
                const compileOptions = {
                    ..._compileOptions,
                    cache: renderOptions.cache != null ? renderOptions.cache : _compileOptions.cache,
                    hydratable: renderOptions.hydratable != null ? renderOptions.hydratable : _compileOptions.hydratable
                };

                // Create view component wrapped with ViewGlobals.svelte component and compile
                WrappedViewComponent = await ServerViewFactory.createWrappedViewAndCompile(filename, compileOptions);
            }
            catch(err) {
                err.code = err.code || ERROR_EXPRESS_SVELTE_COMPILE;
                return req.next(err);
            }

            // Render component
            let output = null;

            try {
                output = WrappedViewComponent.render({
                    globalAssets: {
                        host: bundlesHost,
                        scripts: scriptsMap,
                        styles: stylesMap
                    },
                    globalProps,
                    globalStore,
                    props
                });
            }
            catch(err) {
                err.code = err.code || ERROR_EXPRESS_SVELTE_RENDER;
                return req.next(err);
            }

            // Build template
            const templateFilename = renderOptions.templateFilename || opts.templateFilename || TEMPLATE_FILENAME;
            const templateOptions = {
                ..._templateOptions,
                cache: renderOptions.cache != null ? renderOptions.cache : _compileOptions.cache
            };
            const template = await Utils.buildTemplateByFilename(templateFilename, templateOptions);

            // Build view script tag
            const hydratable = renderOptions.hydratable != null ? renderOptions.hydratable : _compileOptions.hydratable;
            const scriptSrc = scriptsMap.get(filenameKey) || null;
            const script = scriptSrc ? bundlesHost + scriptSrc : null;
            const scriptLegacy = scriptSrc ? `${bundlesHost}/legacy${scriptSrc}` : null;
            const scriptModern = scriptSrc ? `${bundlesHost}/modern${scriptSrc}` : null;

            // Build HTML
            const str = template({
                head: output.head,
                style: output.css.code,
                hydratable,
                globalProps: hydratable ? globalProps : null,
                globalStore: hydratable ? globalStore : null,
                props: hydratable ? props : null,
                script: hydratable ? script : null,
                scriptLegacy: hydratable ? scriptLegacy : null,
                scriptModern: hydratable ? scriptModern : null,
                html: output.html,
                legacy
            });

            this.send(str);
        }
        catch(err) {
            req.next(err);
        }
    }

    return function expressSvelteMiddleware(req, res, next) {
        res.svelte = svelte;
        next();
    };
}

/**
 * @typedef {ExpressSvelteCompileOptions} ExpressSvelteOptions
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
 * @property {String}          [templateFilename]
 *
 * @property {Boolean}         [legacy = true]                  Defaults to true. Use both modern and legacy builds.
 */

/**
 * @typedef {Object} ExpressSvelteRenderOptions
 *
 * @property {Boolean}   [cache]               Default is inferred with [dev] at express svelte main config.
 *
 * @property {Boolean}   [hydratable = false]  Defaults to express svelte main config or false if not set.
 *
 * @property {String}    [templateFilename]    Override template
 *
 * @property {Object}    [props]
 *
 * @property {Object}    [globalProps]
 *
 * @property {Object}    [globalStore]
 */

/**
 * @typedef {Object} ExpressSvelteCompileOptions
 *
 * @property {Boolean}   [env]                 Defaults to process.env.NODE_ENV.
 *                                             Used to determine [dev] and [cache] values if not set.
 *                                             It replaces "process.env.NODE_ENV" with "@rollup/plugin-replace" plugin.
 *
 * @property {Boolean}   [dev]                 Default is inferred with env. (If [env] is "development" or "testing" is set to true).
 *                                             It sets [dev], [preserveComments] and [preserveWhitespace] with true at "rollup-plugin-svelte" plugin
 *                                             and enables source map support
 *
 * @property {Boolean}   [cache]               Default is inferred with dev. (If [env] is "development" or "testing" is set to true).
 *
 * @property {Boolean}   [hydratable = false]  Defaults to false.
 *
 *
 * @property {Object}    [replace = {}]        Object of keys to be replaced with "@rollup/plugin-replace" plugin.
 *
 * @property {Array}     [preprocess = []]     Preprocess array to be used at "rollup-plugin-svelte" plugin
 *
 * @property {Array}     [dedupe = []]         Dependencies array to dedupe array to be used at "plugin-node-resolve" plugin
 */

/**
 * @typedef {Object} ExpressSvelteTemplateOptions
 *
 *  @property {Boolean}   [env]                Defaults to process.env.NODE_ENV.
 *                                             Used to determine [dev] and [cache] values if not set.
 *
 * @property {Boolean}   [dev]                 Default is inferred with env. (If [env] is "development" or "testing" is set to true).
 *
 * @property {Boolean}   [cache]               Default is inferred with dev. (If [env] is "development" or "testing" is set to true).
 */

module.exports = expressSvelte;