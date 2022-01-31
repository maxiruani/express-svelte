'use strict';

const path = require('path');
const fs = require("fs-extra");

const fastGlob = require('fast-glob');
const replace = require('@rollup/plugin-replace');
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const svelte = require('rollup-plugin-svelte');
const svelteCss = require('rollup-plugin-css-only');
const svelteSvg = require('rollup-plugin-svelte-svg');
const { terser } = require('rollup-plugin-terser');
const babel = require('@rollup/plugin-babel').default;

const NODE_ENV = process.env.NODE_ENV;
const NODE_ENV_DEVELOPMENT = 'development';
const NODE_ENV_TESTING = 'testing';
const DEV = NODE_ENV === NODE_ENV_DEVELOPMENT || NODE_ENV === NODE_ENV_TESTING || NODE_ENV == null;

const DEFAULT_INPUT = 'views/**/*.svelte';
const DEFAULT_RELATIVE = 'views/';
const DEFAULT_OUTPUT_DIR = 'public/dist';

// Wrapped view creation
let _wrappedViewTmpDirname = null;

class BrowserViewFactory {

    static async clear() {
        // Wrapper creation
        _wrappedViewTmpDirname = process.cwd() + '/.express-svelte/browser';
        await this.clearAndEnsureDir(_wrappedViewTmpDirname);
    }

    /**
     * @param {String} dirname
     */
    static async clearAndEnsureDir(dirname) {
        await fs.remove(dirname);
        await fs.ensureDir(dirname);
    }

    /**
     * @param {String} relativeFilename
     * @param {String} wrappedAbsoluteFilename
     * @return {Promise.<String>}
     */
    static async generateSource(relativeFilename, wrappedAbsoluteFilename) {

        const viewGlobalsRelativePath = path.relative(path.dirname(wrappedAbsoluteFilename), __dirname + '/components') + '/ViewGlobals.svelte';

        return `
import ViewGlobals from '${viewGlobalsRelativePath.replace(/\\/g, '/')}';
import ViewComponent from '${relativeFilename.replace(/\\/g, '/')}';
const [ target = document.body ] = document.getElementsByClassName('view-target');
const [ anchor = null ] = document.getElementsByClassName('view-anchor');

const globalProps = window._GLOBAL_PROPS_ || {};
const globalStores = window._GLOBAL_STORES_ || {};
const props = window._PROPS_ || {};

new ViewGlobals({
    target,
    anchor,
    hydrate: true,
    props: {
        globalProps,
        globalStores,
        component: ViewComponent,
        props
    }
});`;
    }

    /**
     * @param {String} absoluteFilename
     * @param {String} output
     * @return {Promise.<String>}
     */
    static async createWrappedView(absoluteFilename, output) {
        const wrappedAbsoluteFilename = path.join(_wrappedViewTmpDirname, `${output}.js`);
        const relativeFilename = path.relative(path.dirname(wrappedAbsoluteFilename), path.dirname(absoluteFilename)) + '/' + path.basename(absoluteFilename);

        const source = await this.generateSource(relativeFilename, wrappedAbsoluteFilename);

        await fs.ensureFile(wrappedAbsoluteFilename);
        await fs.writeFile(wrappedAbsoluteFilename, source, { enconding: 'utf-8' });
        return wrappedAbsoluteFilename;
    }

    /**
     * @param {Object}  opts
     * @param {String}  opts.input
     * @param {String}  opts.output
     * @param {Object}  opts.legacy
     * @param {String=} opts.outputDir
     * @param {Object=} opts.replace
     * @param {Array=}  opts.preprocess
     * @param {Array=}  opts.dedupe
     * @return {Object}
     */
    static getConfig(opts = {}) {
        const { input, output, legacy } = opts;

        const outputDir = opts.outputDir || DEFAULT_OUTPUT_DIR;
        const replaceOpts = opts.replace || {};
        const preprocess = opts.preprocess || [];
        const dedupe = opts.dedupe || [];

        return {
            cache: true,
            watch: {},
            input: {
                [output]: input
            },
            output: {
                sourcemap: DEV,
                format: 'iife',
                dir: outputDir,
                entryFileNames: DEV ? '[name].js' : '[name]-[hash].js',
                assetFileNames: DEV ? '[name][extname]' : '[name]-[hash][extname]'
            },
            plugins: [
                replace({
                    preventAssignment: true,
                    'process.browser': true,
                    'process.env.NODE_ENV': `'${NODE_ENV || NODE_ENV_DEVELOPMENT}'`,
                    ...replaceOpts
                }),

                svelteSvg({
                    dev: DEV
                }),

                svelteCss({
                    output: false
                }),

                svelte({
                    emitCss: true,
                    preprocess,
                    compilerOptions: {
                        css: false,
                        dev: DEV,
                        preserveComments: DEV,
                        preserveWhitespace: DEV,
                        hydratable: true
                    }
                }),

                nodeResolve({
                    browser: true,
                    dedupe: [
                        'svelte',
                        'svelte/animate',
                        'svelte/easing',
                        'svelte/internal',
                        'svelte/motion',
                        'svelte/store',
                        'svelte/transition',
                        ...dedupe
                    ]
                }),

                commonjs(),

                legacy === true && babel({
                    extensions: ['.js', '.mjs', '.html', '.svelte'],
                    babelHelpers: 'runtime',
                    exclude: ['node_modules/@babel/**', 'node_modules/core-js/**'],
                    presets: [
                        [
                            '@babel/preset-env',
                            {
                                targets: '> 0.25%, not dead',
                                useBuiltIns: 'usage',
                                corejs: 3
                            }
                        ]
                    ],
                    plugins: [
                        '@babel/plugin-syntax-dynamic-import',
                        [
                            '@babel/plugin-transform-runtime',
                            {
                                useESModules: true
                            }
                        ]
                    ]
                }),

                DEV === false && terser()
            ],

            preserveEntrySignatures: false
        }
    }

    /**
     * @param {String=}  input
     * @param {Object=}  opts
     * @param {String=}  opts.relative
     * @param {String=}  opts.outputDir
     * @param {Object=}  opts.replace
     * @param {Array=}   opts.preprocess
     * @param {Array=}   opts.dedupe
     * @param {Boolean=} opts.legacy
     * @return {Promise.<Array>}
     */
    static async create(input, opts = {}) {
        const pattern = path.join(process.cwd(), input || DEFAULT_INPUT).replace(/\\/g, '/');
        const absoluteFilenames = await fastGlob(pattern);
        const legacy = opts.legacy != null ? opts.legacy : true;

        await this.clear();

        let configs = [];

        for (let i = 0; i < absoluteFilenames.length; i++) {
            const absoluteFilename = absoluteFilenames[i];
            const output = _getOutputFilename(absoluteFilename, opts.relative || DEFAULT_RELATIVE);

            // Push modern config
            let wrappedAbsoluteFilename = await this.createWrappedView(absoluteFilename, output);
            let completeLegacyConfig = this.getConfig({ ...opts, input: wrappedAbsoluteFilename, output: `${output}-modern`, legacy: false });
            configs.push(completeLegacyConfig);

            // Push legacy config
            if (legacy === true) {
                wrappedAbsoluteFilename = await this.createWrappedView(absoluteFilename, output);
                completeLegacyConfig = this.getConfig({ ...opts, input: wrappedAbsoluteFilename, output: `${output}-legacy`, legacy: true });
                configs.push(completeLegacyConfig);
            }
        }

        return configs;
    }
}

/**
 * @param {String} filename
 * @return {String}
 * @private
 */
function _removeExtension(filename) {
    return filename.replace(/\.[^/.]+$/, '');
}

/**
 * @param {String} absoluteFilename
 * @param {String} relative
 * @private
 * @return {String}
 */
function _getOutputFilename(absoluteFilename, relative) {
    const filepath = path.relative(relative, absoluteFilename);
    const isRelative = !filepath.startsWith('../');
    const relativeFilepath = isRelative ? filepath : path.relative('./', absoluteFilename);
    return _removeExtension(relativeFilepath);
}

module.exports = BrowserViewFactory;