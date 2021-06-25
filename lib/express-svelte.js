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
 * @param {ExpressSvelteOptions} mainOpts
 * @return {Function}
 */
function expressSvelte(mainOpts = {}) {

    let viewsDirname = mainOpts.viewsDirname || process.cwd() + DEFAULT_VIEWS_DIRNAME;
    viewsDirname = Array.isArray(viewsDirname) ? viewsDirname : [viewsDirname];

    let defaultExtension = mainOpts.defaultExtension || DEFAULT_EXTENSION;
    defaultExtension = defaultExtension[0] !== '.' ? '.' + defaultExtension : defaultExtension;

    let bundlesDirnames = mainOpts.bundlesDirname || process.cwd() + DEFAULT_BUNDLES_DIRNAME;
    bundlesDirnames = Array.isArray(bundlesDirnames) ? bundlesDirnames : [bundlesDirnames];
    bundlesDirnames = Utils.resolveDirnames(bundlesDirnames);

    let bundlesPattern = mainOpts.bundlesPattern || DEFAULT_BUNDLES_PATTERN;
    let bundlesHost = mainOpts.bundlesHost || DEFAULT_BUNDLES_HOST;

    // Scan bundles directories and get all js and css files synchronous
    const bundlesRegExp = Utils.getFilenameRegExp(bundlesPattern);
    const bundlesFilenames = bundlesDirnames.map(Utils.getFilenamesSync).flat();

    // Build script and styles maps based on scanned bundles
    const { scriptsMap } = Utils.getFilenamesMaps(bundlesFilenames, bundlesRegExp, bundlesDirnames);

    // Define default values
    const _compileOptions = {
        env: mainOpts.env || NODE_ENV || NODE_ENV_DEVELOPMENT,
        dev: null,
        cache: null,
        hydratable: mainOpts.hydratable != null ? mainOpts.hydratable === true : false,
        replace: mainOpts.replace || {},
        preprocess: mainOpts.preprocess || [],
        dedupe: mainOpts.dedupe || []
    };

    _compileOptions.dev = mainOpts.dev != null ? mainOpts.dev : _compileOptions.env === NODE_ENV_DEVELOPMENT || _compileOptions.env === NODE_ENV_TESTING;
    _compileOptions.cache = mainOpts.cache != null ? mainOpts.cache : _compileOptions.dev === false;

    const _templateFilename = mainOpts.templateFilename || TEMPLATE_FILENAME;

    const _templateOptions = {
        env: _compileOptions.env,
        dev: _compileOptions.dev,
        cache: _compileOptions.cache
    };

    const _legacy = mainOpts.legacy != null ? mainOpts.legacy : true;

    // Clear tmp dir and create if not exists synchronous
    ServerViewFactory.clear();

    /**
     * @param {String} name
     * @param {ExpressSvelteCompileOptions=} options
     * @return {Promise.<Object>}
     */
    async function svelteCompile(name, options = {}) {
        try {
            // Lookup view with express view engine like logic
            const filename = await Utils.lookup(name, viewsDirname, defaultExtension);

            if (filename == null) {
                const err = new Error(`Failed to lookup view "${name}" in views directories ${JSON.stringify(viewsDirname)}`);
                err.code = ERROR_EXPRESS_SVELTE_LOOKUP;
                throw err;
            }

            // Define request props based on argument options and defaults from middleware
            const cache = options.cache != null ? options.cache : _compileOptions.cache;
            const hydratable = options.hydratable != null ? options.hydratable === true : _compileOptions.hydratable;

            try {
                const compileOptions = {
                    ..._compileOptions,
                    cache,
                    hydratable
                };

                // Create view component wrapped with ViewGlobals.svelte component and compile
                const WrappedViewComponent = await ServerViewFactory.createWrappedViewAndCompile(filename, compileOptions);

                // Get view filename key to be able to get view script if exists
                const filenameKey = Utils.getRelativeFilenameKey(filename, viewsDirname);

                return {
                    WrappedViewComponent,
                    filename,
                    filenameKey,
                    cache,
                    hydratable
                };
            }
            catch(err) {
                err.code = err.code || ERROR_EXPRESS_SVELTE_COMPILE;
                throw err;
            }
        }
        catch(err) {
            throw err;
        }
    }

    /**
     * @param {String} name
     * @param {ExpressSvelteRenderOptions=} renderOptions
     * @return {Promise}
     */
    async function svelteRender(name, renderOptions = {}) {
        const { req } = this;

        try {
            // Create view component wrapped with ViewGlobals.svelte component and compile
            const { WrappedViewComponent, filenameKey, cache, hydratable } = await svelteCompile(name, renderOptions);

            // Define request props based on argument options and defaults from middleware
            const props = renderOptions.props || {};
            const globalProps =  { ...renderOptions.globalProps };
            const globalStores = { ...renderOptions.globalStores };
            const legacy = _legacy;

            // Render component
            let output = null;

            try {
                output = WrappedViewComponent.render({
                    globalProps: { ...globalProps },
                    globalStores: { ...globalStores },
                    props
                });
            }
            catch(err) {
                err.code = err.code || ERROR_EXPRESS_SVELTE_RENDER;
                return req.next(err);
            }

            // Build template
            const templateFilename = renderOptions.templateFilename || _templateFilename;
            const templateOptions = {
                ..._templateOptions,
                cache
            };
            const template = await Utils.buildTemplateByFilename(templateFilename, templateOptions);

            // Build view script tag
            let scriptLegacy = null;
            let scriptModern = null;

            if (hydratable === true) {
                scriptLegacy = scriptsMap.get(`${filenameKey}-legacy`) || null;
                scriptModern = scriptsMap.get(`${filenameKey}-modern`) || null;
                scriptLegacy = scriptLegacy ? bundlesHost + scriptLegacy : null;
                scriptModern = scriptModern ? bundlesHost + scriptModern : null;
            }

            // Build HTML
            const str = template({
                head: output.head,
                style: output.css.code,
                hydratable,
                globalProps: hydratable ? globalProps : null,
                globalStores: hydratable ? globalStores : null,
                props: hydratable ? props : null,
                legacy,
                scriptLegacy: scriptLegacy,
                scriptModern: scriptModern,
                html: output.html
            });

            this.send(str);
        }
        catch(err) {
            req.next(err);
        }
    }

    function expressSvelteMiddleware(req, res, next) {
        res.svelteCompile = svelteCompile;
        res.svelte = svelteRender;
        next();
    }
    expressSvelteMiddleware.compile = svelteCompile;
    return expressSvelteMiddleware;
}

/**
 * @typedef {ExpressSvelteViewFactoryCompileOptions} ExpressSvelteOptions
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
 *
 * @property {String}          [defaultExtension = '.svelte']
 *
 * @property {String}          [templateFilename]
 *
 * @property {Boolean}         [legacy = true]                  Defaults to true. Use both modern and legacy builds.
 */

/**
 * @typedef {Object} ExpressSvelteRenderOptions
 *
 * @property {Boolean}   [cache]                Default is inferred with [dev] at express svelte main config.
 *
 * @property {Boolean}   [hydratable]           Defaults to express svelte main config or true.
 *
 * @property {String}    [templateFilename]     Override template
 *
 * @property {Object}    [props]
 *
 * @property {Object}    [globalProps]
 *
 * @property {Object}    [globalStores]
 */

/**
 * @typedef {Object} ExpressSvelteCompileOptions
 *
 * @property {Boolean}   [cache]                Default is inferred with [dev] at express svelte main config.
 *
 * @property {Boolean}   [hydratable]           Defaults to express svelte main config or true.
 */

/**
 * @typedef {Object} ExpressSvelteViewFactoryCompileOptions
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