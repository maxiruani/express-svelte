'use strict';

const fs = require('fs-extra');
const crypto = require('crypto');

const sourceMapSupport = require('source-map-support');
const nodeEval = require('eval')

const rollup = require('rollup');
const replace = require('@rollup/plugin-replace');
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const svelte = require('rollup-plugin-svelte');

const NODE_ENV = process.env.NODE_ENV;
const NODE_ENV_DEVELOPMENT = 'development';
const NODE_ENV_TESTING = 'testing';

const VIEW_GLOBALS_COMPONENT_FILENAME = __dirname + '/components/ViewGlobals.svelte';

const ERROR_EXPRESS_SVELTE_COMPILE_OUTPUT_INVALID_LENGTH = 'ERROR_EXPRESS_SVELTE_COMPILE_OUTPUT_INVALID_LENGTH';
const ERROR_EXPRESS_SVELTE_COMPILE_OUTPUT_INVALID_TYPE = 'ERROR_EXPRESS_SVELTE_COMPILE_OUTPUT_INVALID_TYPE';

// Wrapped view creation
let _wrappedViewTmpDirname = null;
let _wrappedViewCacheMap = new Map();
let _wrappedViewTemplateStr = null;

// Wrapped view compilation
let _compiledViewCacheMap = new Map();
let _installedSourceMapSupport = false;

class ServerViewFactory {

    static clear() {
        // Wrapper creation
        _wrappedViewCacheMap = new Map();
        _wrappedViewTmpDirname = process.cwd() + '/.express-svelte/server';
        this.clearAndEnsureDirSync(_wrappedViewTmpDirname);

        // Compilation
        _compiledViewCacheMap = new Map();
    }

    /**
     * @param {String} dirname
     */
    static clearAndEnsureDirSync(dirname) {
        fs.removeSync(dirname);
        fs.ensureDirSync(dirname);
    }

    /**
     * @param {String} filename
     * @return {Promise.<String>}
     */
    static async createWrappedView(filename) {
        if (_wrappedViewTemplateStr == null) {
            _wrappedViewTemplateStr = await fs.readFile(VIEW_GLOBALS_COMPONENT_FILENAME, { encoding: 'utf8' });
        }

        let wrappedViewFilename = _wrappedViewCacheMap.get(filename) || null;

        if (wrappedViewFilename != null) {
            return wrappedViewFilename;
        }

        const wrappedViewContentStr = _wrappedViewTemplateStr.replace('export let component;', `import component from '${filename}'`);
        wrappedViewFilename = _wrappedViewTmpDirname + '/' + crypto.randomBytes(10).toString('hex') + '.svelte';

        await fs.writeFile(wrappedViewFilename, wrappedViewContentStr, { encoding: 'utf8', flag: 'w' });
        _wrappedViewCacheMap.set(filename, wrappedViewFilename);

        return wrappedViewFilename;
    }

    /**
     * @param {String} wrappedViewFilename
     * @param {ExpressSvelteCompileOptions} [opts]
     * @return {Promise.<Function>}
     */
    static async compile(wrappedViewFilename, opts = {}) {

        const env = opts.env || NODE_ENV || NODE_ENV_DEVELOPMENT;
        const dev = opts.dev != null ? opts.dev : env === NODE_ENV_DEVELOPMENT || env === NODE_ENV_TESTING;
        const cache = opts.cache != null ? opts.cache : dev === false;
        const hydratable = opts.hydratable != null ? opts.hydratable : true;
        const replaceOpts = opts.replace || {};
        const preprocess = opts.preprocess || [];
        const dedupe = opts.dedupe || [];

        let cacheKey = null;

        if (cache === true) {
            // Hydratable is the only config options that can change at runtime after main config is set
            cacheKey = `${wrappedViewFilename}|hydratable:${hydratable}`;
            const compiled = _compiledViewCacheMap.get(cacheKey);

            if (compiled != null) {
                return compiled;
            }
        }

        const inputOptions = {
            cache: false,
            input: wrappedViewFilename,
            plugins: [
                replace({
                    'process.browser': false,
                    'process.env.NODE_ENV': env,
                    ...replaceOpts
                }),

                svelte({
                    generate: 'ssr',
                    css: false,
                    preprocess,
                    dev,
                    preserveComments: dev,
                    preserveWhitespace: dev,
                    hydratable
                }),

                nodeResolve({
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

                commonjs()
            ],
            preserveEntrySignatures: 'strict'
        };

        const outputOptions = {
            format: 'cjs',
            exports: 'auto',
            sourcemap: dev === true ? 'inline' : false
        };

        const bundle = await rollup.rollup(inputOptions);
        const { output } = await bundle.generate(outputOptions);

        if (output.length !== 1) {
            const err = new Error(`Invalid compile output. Generated more than one chunk or asset. wrappedViewFilename:${wrappedViewFilename} output.length:${output.length}`);
            err.code = ERROR_EXPRESS_SVELTE_COMPILE_OUTPUT_INVALID_LENGTH;
            throw err;
        }

        const chunk = output[0];

        if (chunk.type !== 'chunk') {
            const err = new Error(`Invalid compile output. Generated an asset instead of a chunk. wrappedViewFilename:${wrappedViewFilename}`);
            err.code = ERROR_EXPRESS_SVELTE_COMPILE_OUTPUT_INVALID_TYPE;
            throw err;
        }

        // Add source map if apply
        const code = dev === true && chunk.map != null ? `${chunk.code}\n//# sourceMappingURL=${chunk.map.toUrl()}` : chunk.code;

        // If dev is enabled, we add sourcemap support for debugging
        if (dev === true) {
            _installSourceMapSupport();
        }

        // Eval (require from string) and return compiled component
        const compiled = nodeEval(code);

        if (cache === true) {
            _compiledViewCacheMap.set(cacheKey, compiled);
        }

        return compiled;
    }

    /**
     * @param {String} filename
     * @param {ExpressSvelteCompileOptions} [opts]
     * @return {Promise.<Function>}
     */
    static async createWrappedViewAndCompile(filename, opts) {
        const wrappedViewFilename = await this.createWrappedView(filename);
        return this.compile(wrappedViewFilename, opts);
    }
}

function _installSourceMapSupport() {
    if (_installedSourceMapSupport === true) {
        return;
    }

    _installedSourceMapSupport = true;

    sourceMapSupport.install({
        handleUncaughtExceptions: false,
        environment: 'node'
    });
}

module.exports = ServerViewFactory;