'use strict';

const Utils = require('./utils');
const Renderer = require('./renderer');

const ERROR_EXPRESS_SVELTE_LOOKUP = 'ERROR_EXPRESS_SVELTE_LOOKUP';

const DEFAULT_VIEWS_DIRNAME = '/views';
const DEFAULT_BUNDLES_DIRNAME = '/public/dist';
const DEFAULT_EXTENSION = '.svelte';

/**
 * @param {ExpressSvelteOptions} opts
 * @return {Function}
 */
function expressSvelte(opts = {}) {

    let roots = opts.viewsDirname || process.cwd() + DEFAULT_VIEWS_DIRNAME;
    roots = Array.isArray(roots) ? roots : [roots];

    let defaultExtension = opts.defaultExtension || DEFAULT_EXTENSION;
    defaultExtension = defaultExtension[0] !== '.' ? '.' + defaultExtension : defaultExtension;

    // TODO: Read bundles directory to get map of files without hash (Make it sync)
    // TODO: Read bundles directory to get map of files without hash (Make it sync)
    // TODO: Read bundles directory to get map of files without hash (Make it sync)
    // TODO: Read bundles directory to get map of files without hash (Make it sync)
    // TODO: Read bundles directory to get map of files without hash (Make it sync)

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

                const filename = await Utils.lookup(name, roots, defaultExtension);

                if (filename == null) {
                    const err = new Error(`Failed to lookup view "${name}" in views directories ${JSON.stringify(roots)}`);
                    err.code = ERROR_EXPRESS_SVELTE_LOOKUP;
                    req.next(err);
                    return;
                }

                // getContext('global.assets'); { scripts, styles, host }
                // getContext('global.props');
                // getContext('global.store');

                // TODO: Set __ASSETS__ as global context (only set at SSR)

                const globalProps = options.globalProps || {};
                const serializedGlobalProps = Utils.getSerializedGlobalProps(app.locals, res.locals, globalProps);

                // Compile
                // Render

                // const ViewComponent = Renderer.compile(filename, );

                // Renderer str
                const str = '';

                this.send(str);
            }
            catch(err) {
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
 *                                                              [hash] will be striped for easy reference.
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