'use strict';

const devalue = require('@nuxt/devalue');
const Utils = require('./utils');
const Renderer = require('./renderer');

const ERROR_EXPRESS_SVELTE_LOOKUP = 'ERROR_EXPRESS_SVELTE_LOOKUP';
const ERROR_EXPRESS_SVELTE_COMPILE = 'ERROR_EXPRESS_SVELTE_COMPILE';
const ERROR_EXPRESS_SVELTE_RENDER = 'ERROR_EXPRESS_SVELTE_RENDER';

const VIEW_GLOBALS_COMPONENT_FILENAME = __dirname + '/components/ViewGlobals.svelte';
const TEMPLATE_FILENAME = __dirname + '/template.html';

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
    bundlesDirnames = Utils.resolveDirnames(bundlesDirnames);

    let bundlesPattern = opts.bundlesPattern || DEFAULT_BUNDLES_PATTERN;
    let bundlesHost = opts.bundlesHost || DEFAULT_BUNDLES_HOST;

    const bundlesRegExp = Utils.getFilenameRegExp(bundlesPattern);
    const bundlesFilenames = bundlesDirnames.map(Utils.getFilenames).flat();

    const { scriptsMap, stylesMap } = Utils.getFilenamesMaps(bundlesFilenames, bundlesRegExp, bundlesDirnames);

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
                    return req.next(err);
                }

                // Get view filename key to be able to get view script if exists
                const filenameKey = Utils.getRelativeFilenameKey(filename, viewsDirname);

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
                let ViewComponent = null;

                try {
                    ViewComponent = Renderer.compile(filename, opts);
                }
                catch(err) {
                    err.code = err.code || ERROR_EXPRESS_SVELTE_COMPILE;
                    return req.next(err);
                }

                // Render component
                let output = null;

                try {
                    output = ViewGlobals.render({
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
                }
                catch(err) {
                    err.code = err.code || ERROR_EXPRESS_SVELTE_RENDER;
                    return req.next(err);
                }

                // Use template string if defined
                let templateString = (options && options.templateString) || (opts && opts.templateString) || null;

                // Use template filename if defined or default template
                if (templateString == null && (options.templateFilename != null || opts.templateString != null)) {
                    const templateFilename = options.templateFilename || opts.templateFilename || TEMPLATE_FILENAME;
                    templateString = await Utils.getTemplate(templateFilename, opts);
                }

                // Build view script tag
                let scriptSrc = scriptsMap.get(filenameKey) || null;
                let scripts = '';

                if (scriptSrc != null) {
                    scripts = `<script defer type="text/javascript" src="${bundlesHost + scriptSrc}"></script>`;
                }

                const { head, html, css } = output;

                const str = templateString
                        .replace('${head}', head)
                        .replace('${styles}', css)
                        .replace('${globalProps}', `<script>var window._GLOBAL_PROPS_ = ${devalue(serializedGlobalProps)};</script>`)
                        .replace('${globalStore}', `<script>var window._GLOBAL_STORE_ = ${devalue(serializedGlobalStore)};</script>`)
                        .replace('${scripts}', scripts)
                        .replace('${html}', html);

                this.send(str);
            }
            catch(err) {
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