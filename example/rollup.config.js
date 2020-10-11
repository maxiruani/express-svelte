'use strict';

const replace = require('@rollup/plugin-replace');
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const svelte = require('rollup-plugin-svelte');
const { terser } = require('rollup-plugin-terser');
const babel = require('@rollup/plugin-babel');

const env = process.env.NODE_ENV;
const dev = env === 'development';
const legacy = !!process.env.LEGACY_BUILD;

// TODO: Create local .tmp and wrap all
// TODO: Create local .tmp and wrap all
// TODO: Create local .tmp and wrap all

module.exports = {
    input: ['example/.tmp/Page.js'],
    output: {
        sourcemap: true,
        format: 'iife',
        dir: 'example/public/dist',
        chunkFileNames: dev ? '[name].js' : '[name]-[hash].js',
        assetFileNames: dev ? '[name][extname]' : '[name]-[hash][extname]'
    },
    plugins: [
        replace({
            'process.browser': true,
            'process.env.NODE_ENV': JSON.stringify(env)
        }),

        svelte({
            dev,
            hydratable: true,
            emitCss: false,
            css: css => {
                css.write(css.filename, true);
            }
        }),

        nodeResolve({
            browser: true,
            dedupe: ['svelte']
        }),

        commonjs(),

        legacy && babel({
            extensions: ['.js', '.mjs', '.html', '.svelte'],
            runtimeHelpers: 'runtime',
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

        !dev && terser()
    ],

    preserveEntrySignatures: false
};