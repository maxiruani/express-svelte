'use strict';

const Utils = require('./utils');

const ERROR_EXPRESS_SVELTE_LOOKUP = 'ERROR_EXPRESS_SVELTE_LOOKUP';

/**
 * @param {Object}          opts
 * @param {String|String[]} opts.viewsDirname       A directory or an array of directories for the app's views (svelte files).
 * @param {String|String[]} opts.bundlesDirname     A directory or an array of directories for the app's views compiled bundles (js and css files).
 * @param {String=}         opts.bundlesPattern     Bundles output format. Default: [name]-[hash][extname] (hash will be striped).
 * @param {String=}         opts.bundlesHost        Optional host to prefix bundles or CSS. Eg, a CDN host or different subdomain.
 * @param {String=}         opts.template
 * @param {String=}         opts.templateFilename
 * @return {Function}
 */
function expressSvelte(opts) {

    return function expressSvelteMiddleware(req, res, next) {

        // TODO: Set roots based on views
        // TODO: Read bundles directory to get map of files without hash

        const __ROOTS__ = [];
        const __EXT__ = '.svelte';

        /**
         * @param {String}  name
         * @param {Object}  options
         * @param {Object}  options.props
         * @param {Object}  options.globalProps
         * @param {String=} options.template
         * @param {String=} options.templateFilename
         */
        res.svelte = async function svelte(name, options) {
            try {
                const req = this.req;
                const app = this.req.app;

                const filepath = await Utils.lookup(name, __ROOTS__, __EXT__);

                if (filepath == null) {
                    const err = new Error(`Failed to lookup view "${name}" in views directories ${JSON.stringify(__ROOTS__)}`);
                    err.code = ERROR_EXPRESS_SVELTE_LOOKUP;
                    req.next(err);
                    return;
                }

                // TODO: Build globalProps based on app.locals and res.locals
                // TODO: Support for $serialized = [] at globalProps
                // TODO: Set __ASSETS__ as global context (only set at SSR)

                // Compile
                // Render

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

module.exports = expressSvelte;