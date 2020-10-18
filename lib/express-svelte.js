'use strict';

const Utils = require('./utils');
const Renderer = require('./renderer');
const ViewFactory = require('./view-factory');

const ERROR_EXPRESS_SVELTE_LOOKUP = 'ERROR_EXPRESS_SVELTE_LOOKUP';
const ERROR_EXPRESS_SVELTE_COMPILE = 'ERROR_EXPRESS_SVELTE_COMPILE';
const ERROR_EXPRESS_SVELTE_RENDER = 'ERROR_EXPRESS_SVELTE_RENDER';

const TEMPLATE_FILENAME = __dirname + '/data/template.html';

const DEFAULT_VIEWS_DIRNAME = '/views';
const DEFAULT_BUNDLES_DIRNAME = '/public/dist';
const DEFAULT_BUNDLES_PATTERN = '[name]-[hash][extname]';
const DEFAULT_BUNDLES_HOST = '/public/dist';
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
    bundlesDirnames = Utils.resolveDirnames(bundlesDirnames);

    let bundlesPattern = opts.bundlesPattern || DEFAULT_BUNDLES_PATTERN;
    let bundlesHost = opts.bundlesHost || DEFAULT_BUNDLES_HOST;

    // Scan bundles directories and get all js and css files synchronous
    const bundlesRegExp = Utils.getFilenameRegExp(bundlesPattern);
    const bundlesFilenames = bundlesDirnames.map(Utils.getFilenames).flat();

    // Build script and styles maps based on scanned bundles
    const { scriptsMap, stylesMap } = Utils.getFilenamesMaps(bundlesFilenames, bundlesRegExp, bundlesDirnames);

    // Clear tmp dir and create if not exists synchronous
    ViewFactory.clear();

    /**
     * @param {String}  name
     * @param {Object}  options
     * @param {Object}  options.props
     * @param {Object}  options.globalProps
     * @param {Object}  options.globalStore
     * @param {String=} options.templateFilename
     */
    async function svelte(name, options = {}) {
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
            const props = options.props || {};
            const globalProps = Utils.getSerializedProps('$globalProps', app.locals, req.locals, res.locals, options.globalProps);
            const globalStore = Utils.getSerializedProps('$globalStore', app.locals, req.locals, res.locals, options.globalStore);

            // Create view component wrapped with ViewGlobals.svelte component
            const viewFilename = await ViewFactory.create(filename);

            // Compile created view component
            let ViewComponent = null;

            try {
                ViewComponent = await Renderer.compile(viewFilename, opts);
            }
            catch(err) {
                err.code = err.code || ERROR_EXPRESS_SVELTE_COMPILE;
                return req.next(err);
            }

            // Render component
            let output = null;

            try {
                output = ViewComponent.render({
                    globalAssets: {
                        host: bundlesHost,
                        scripts: scriptsMap,
                        styles: stylesMap
                    },
                    globalProps,
                    globalStore,
                    componentProps: props
                });
            }
            catch(err) {
                err.code = err.code || ERROR_EXPRESS_SVELTE_RENDER;
                return req.next(err);
            }

            // Build template
            const templateFilename = options.templateFilename || opts.templateFilename || TEMPLATE_FILENAME;
            const template = await Utils.buildTemplateByFilename(templateFilename, opts);

            // Build view script tag
            let scriptSrc = scriptsMap.get(filenameKey) || null;
            let script = scriptSrc ? bundlesHost + scriptSrc : null;

            // Build HTML
            const str = template({
                head: output.head,
                style: output.css.code,
                globalProps,
                globalStore,
                props,
                script,
                html: output.html
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