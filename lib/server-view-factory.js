'use strict';

const fs = require('fs-extra');
const crypto = require('crypto');

const sourceMapSupport = require('source-map-support');
const nodeEval = require('eval')

const rollup = require('rollup');
const replace = require('@rollup/plugin-replace');
const virtual = require('@rollup/plugin-virtual');
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const svelteCss = require('rollup-plugin-css-only');
const svelteSvg = require('rollup-plugin-svelte-svg');
const svelte = require('rollup-plugin-svelte');

const NODE_ENV = process.env.NODE_ENV;
const NODE_ENV_DEVELOPMENT = 'development';
const NODE_ENV_TESTING = 'testing';

const VIEW_GLOBALS_COMPONENT_FILENAME = __dirname + '/components/View.svelte';

const ERROR_EXPRESS_SVELTE_COMPILE_OUTPUT_INVALID_LENGTH = 'ERROR_EXPRESS_SVELTE_COMPILE_OUTPUT_INVALID_LENGTH';
const ERROR_EXPRESS_SVELTE_COMPILE_OUTPUT_INVALID_TYPE = 'ERROR_EXPRESS_SVELTE_COMPILE_OUTPUT_INVALID_TYPE';

// Wrapped view creation
let _wrappedViewTmpDirname = null;
let _wrappedViewCacheMap = new Map();
let _wrappedViewTemplateStr = null;

// Wrapped view compilation
let _compiledViewCacheMap = new Map();
let _installedSourceMapSupport = false;

// Virtual module
let appEnvModuleStr = null;
let appGlobalModuleStr = null;

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
     * @params {String} env
     * @return {Promise<String>}
     */
    static async getAppEnvVirtualModule(env) {
        if (appEnvModuleStr == null) {
            appEnvModuleStr = await fs.readFile(`${__dirname}/app/env.js`, { encoding: 'utf-8' });
        }

        return appEnvModuleStr
        .replace('{{APP_ENV_BROWSER}}', 'false')
        .replace('{{APP_ENV_SERVER}}', 'true')
        .replace('{{APP_ENV}}', env)
        .replace('{{APP_ENV_DEVELOPMENT}}', `${env === 'development'}`)
        .replace('{{APP_ENV_TESTING}}', `${env === 'testing'}`)
        .replace('{{APP_ENV_STAGE}}', `${env === 'stage'}`)
        .replace('{{APP_ENV_PRODUCTION}}', `${env === 'production'}`);
    }

    /**
     * @return {Promise<String>}
     */
    static async getAppGlobalVirtualModule() {
        if (appGlobalModuleStr == null) {
            appGlobalModuleStr = await fs.readFile(`${__dirname}/app/global.js`, { encoding: 'utf-8' });
        }
        return appGlobalModuleStr;
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

        const wrappedViewContentStr = _wrappedViewTemplateStr
        .replace('const ComponentStatic = null;', `import * as ComponentStatic from '${filename}';`)
        .replace('export let component;', `import component from '${filename}';`);

        wrappedViewFilename = _wrappedViewTmpDirname + '/' + crypto.randomBytes(10).toString('hex') + '.svelte';

        await fs.writeFile(wrappedViewFilename, wrappedViewContentStr, { encoding: 'utf8', flag: 'w' });
        _wrappedViewCacheMap.set(filename, wrappedViewFilename);

        return wrappedViewFilename;
    }

    /**
     * @param {String} wrappedViewFilename
     * @param {ExpressSvelteViewFactoryCompileOptions} [opts]
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

        const appEnvModule = await this.getAppEnvVirtualModule(env);
        const appGlobalModule = await this.getAppGlobalVirtualModule();

        let cacheKey = null;

        if (cache === true) {
            // Hydratable is the only config options that can change at runtime after main config is set
            cacheKey = `${wrappedViewFilename}|hydratable:${hydratable}`;
            const compiled = _compiledViewCacheMap.get(cacheKey);

            if (compiled != null) {
                return compiled;
            }
        }

        let css = '';

        const inputOptions = {
            cache: false,
            input: wrappedViewFilename,
            plugins: [
                replace({
                    preventAssignment: true,
                    'process.browser': false,
                    'process.env.NODE_ENV': `'${env}'`,
                    ...replaceOpts
                }),

                virtual({
                    '$app/env': appEnvModule,
                    '$app/global': appGlobalModule
                }),

                svelteSvg({
                    generate: 'ssr',
                    dev
                }),

                svelteCss({
                    output: function (styles) {
                        css += styles;
                    },
                }),

                svelte({
                    emitCss: true,
                    preprocess,
                    compilerOptions: {
                        css: false,
                        generate: 'ssr',
                        dev,
                        preserveComments: dev,
                        preserveWhitespace: dev,
                        hydratable
                    }
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
            exports: 'named',
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
        compiled.default.css = css;

        if (cache === true) {
            _compiledViewCacheMap.set(cacheKey, compiled);
        }

        return compiled;
    }

    /**
     * @param {String} filename
     * @param {ExpressSvelteViewFactoryCompileOptions} [opts]
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