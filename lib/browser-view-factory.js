'use strict';

const path = require('path');
const fs = require("fs-extra");

const fastGlob = require('fast-glob');
const replace = require('@rollup/plugin-replace');
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const svelte = require('rollup-plugin-svelte');
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

    static HydrationMode = {
        COMPLETE: 'complete',
        PARTIAL: 'partial'
    };

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
    static async generateCompleteSource(relativeFilename, wrappedAbsoluteFilename) {

        const viewGlobalsRelativePath = path.relative(path.dirname(wrappedAbsoluteFilename), __dirname + '/components') + '/ViewGlobals.svelte';

        return `
import { writable } from 'svelte/store';
import ViewGlobals from '${viewGlobalsRelativePath}';
import ViewComponent from '${relativeFilename}';
const [ target = document.body ] = document.getElementsByClassName('view-target');
const [ anchor = null ] = document.getElementsByClassName('view-anchor');

function _createStores(props) {
    const entries = Object.entries(props);
    const output = {};
    for (let i = 0; i < entries.length; i++) {
        const [key, value] = entries[i];
        output[key] = writable(value);
    }
    return output;
}

const globalProps = window._GLOBAL_PROPS_ || {};
const globalStores = _createStores(window._GLOBAL_STORE_ || {});
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
     * @param {"complete"|"partial"} [hydrationMode = "complete"]
     * @return {Promise.<String>}
     */
    static async createWrappedView(absoluteFilename, output, hydrationMode) {
        const wrappedAbsoluteFilename = path.join(_wrappedViewTmpDirname, `${output}-${hydrationMode}.js`);
        const relativeFilename = path.relative(path.dirname(wrappedAbsoluteFilename), path.dirname(absoluteFilename)) + '/' + path.basename(absoluteFilename);

        let source = null;

        if (hydrationMode === this.HydrationMode.PARTIAL) {
            // TODO: Implement
        }
        else {
            source = await this.generateCompleteSource(relativeFilename, wrappedAbsoluteFilename);
        }

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
            watch: {
                // exclude: 'node_modules/**'
            },
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
                    'process.browser': true,
                    'process.env.NODE_ENV': JSON.stringify(NODE_ENV),
                    ...replaceOpts
                }),

                svelteSvg({
                    dev: DEV
                }),

                svelte({
                    emitCss: false,
                    preprocess,
                    compilerOptions: {
                        css: css => {
                            css.write(css.filename, DEV);
                        },
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
     * @param {String=} input
     * @param {Object=} opts
     * @param {String=} opts.relative
     * @param {String=} opts.outputDir
     * @param {Object=} opts.replace
     * @param {Array=}  opts.preprocess
     * @param {Array=}  opts.dedupe
     * @return {Promise.<Array>}
     */
    static async create(input, opts = {}) {
        const pattern = path.join(process.cwd(), input || DEFAULT_INPUT);
        const absoluteFilenames = await fastGlob(pattern);

        await this.clear();

        let configs = [];

        for (let i = 0; i < absoluteFilenames.length; i++) {
            const absoluteFilename = absoluteFilenames[i];
            const output = _getOutputFilename(absoluteFilename, opts.relative || DEFAULT_RELATIVE);

            let wrappedAbsoluteFilename = await this.createWrappedView(absoluteFilename, output, this.HydrationMode.COMPLETE);
            let completeLegacyConfig = this.getConfig({ ...opts, input: wrappedAbsoluteFilename, output: `${output}-cm`, legacy: false });
            configs.push(completeLegacyConfig);

            wrappedAbsoluteFilename = await this.createWrappedView(absoluteFilename, output, this.HydrationMode.COMPLETE);
            completeLegacyConfig = this.getConfig({ ...opts, input: wrappedAbsoluteFilename, output: `${output}-cl`, legacy: true });
            configs.push(completeLegacyConfig);
        }

        // TODO: Build partial hydration bundles
        // TODO: Watch main file and create again on partial hydration and check if deps have changed ?

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