'use strict';

const path = require('path');
const fsSync = require('fs');
const fs = require('fs/promises');
const _ = require('lodash');
const devalue = require('@nuxt/devalue');

const ERROR_EXPRESS_SVELTE_BUNDLE_INVALID_PATTERN = 'ERROR_EXPRESS_SVELTE_INVALID_PATTERN';

const PATTERN_SPLIT = /(\[name]\[hash]|\[extname])/;

const NODE_ENV_DEVELOPMENT = 'development';
const NODE_ENV_TESTING = 'testing';

let _templateCacheMap = new Map();

class Utils {

    /**
     * Lookup view by the given `name`
     *
     * @param {String}   name
     * @param {String[]} roots
     * @param {String}   defaultExtension
     * @return {Promise<String|null>}
     */
    static async lookup(name, roots, defaultExtension) {

        const viewExtension = path.extname(name) || null;
        const viewName = name + (viewExtension == null ? defaultExtension : '');

        for (let i = 0; i < roots.length; i++) {
            const root = roots[i];

            // Resolve the path to an absolute path
            const filename = path.resolve(root, viewName);
            const fileDirname = path.dirname(filename);
            const fileBasename = path.basename(filename);

            // Resolve the file
            const filepath = await this.resolve(fileDirname, fileBasename, viewExtension || defaultExtension);

            if (filepath != null) {
                return filepath;
            }
        }

        return null;
    }

    /**
     *  Resolve the file within the given directory.
     *
     * @param {String} dirname
     * @param {String} basename
     * @param {String} extension
     * @return {Promise<String|null>}
     */
    static async resolve(dirname, basename, extension) {

        // <path>.<ext>
        let filename = path.join(dirname, basename);
        let stat = await this.tryStat(filename);

        if (stat != null && stat.isFile() === true) {
            return filename;
        }

        // <path>/index.<ext>
        filename = path.join(dirname, path.basename(basename, extension), 'index' + extension);
        stat = await this.tryStat(filename);

        if (stat != null && stat.isFile() === true) {
            return filename;
        }

        return null;
    }

    /**
     * @param {String} filepath
     * @return {Promise<Stats|null>}
     */
    static async tryStat(filepath) {
        try {
            return await fs.stat(filepath);
        }
        catch(err) {
            return null;
        }
    }

    /**
     * @param {String[]} dirnames
     * @return {String[]}
     */
    static resolveDirnames(dirnames) {
        return dirnames.map(dirname => path.resolve(dirname, '.'));
    }

    /**
     * @param {Object} dirname
     * @return {String[]}
     */
    static getFilenamesSync(dirname) {
        const dirents = fsSync.readdirSync(dirname, { withFileTypes: true });
        const files = dirents.map(dirent => {
            const res = path.resolve(dirname, dirent.name);
            return dirent.isDirectory() ? Utils.getFilenamesSync(res) : res;
        });
        return files.flat();
    }

    /**
     * @param {String} patternStr
     * @return {RegExp}
     */
    static getFilenameRegExp(patternStr) {
        if (patternStr.endsWith('[extname]') === false) {
            const err = new Error(`Bundle invalid pattern "${patternStr}". Must end with [extname]`);
            err.code = ERROR_EXPRESS_SVELTE_BUNDLE_INVALID_PATTERN;
            throw err;
        }
        if (patternStr.includes('[name]') === false) {
            const err = new Error(`Bundle invalid pattern "${patternStr}". Must contain [name]`);
            err.code = ERROR_EXPRESS_SVELTE_BUNDLE_INVALID_PATTERN;
            throw err;
        }

        const parts = patternStr.split(PATTERN_SPLIT);
        let str = '';

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];

            if (part === '') {
                continue;
            }

            if (part === '[name]') {
                str += '(?<name>.+)';
            }
            else if (part === '[hash]') {
                str += '(?<hash>[a-z0-9]{8})';
            }
            else if (part === '[extname]') {
                str += '(?<extname>\.(?:js|css))';
            }
            else {
                str += _.escapeRegExp(part);
            }
        }

        return new RegExp(`^${str}$`);
    }

    /**
     * @param {String} filename
     * @param {String[]} roots
     */
    static getRelativeFilename(filename, roots) {
        let relative = filename;
        for (let i = 0; i < roots.length; i++) {
            const root = roots[i];
            relative = filename.replace(new RegExp('^' + _.escapeRegExp(root)), '');
        }
        return relative;
    }

    /**
     * @param {String} filename
     * @param {String[]} roots
     */
    static getRelativeFilenameKey(filename, roots) {
        const relative = this.getRelativeFilename(filename, roots);
        const dirname = path.dirname(relative);
        const extname = path.extname(relative)
        const basename = path.basename(relative, extname || null);

        return path.join(dirname, '/' + basename);
    }

    /**
     * @param {String[]} filenames
     * @param {RegExp} pattern
     * @param {String[]} roots
     * @return {Object}
     */
    static getFilenamesMaps(filenames, pattern, roots) {
        const scriptsMap = new Map();
        const stylesMap = new Map();
        const restMap = new Map();

        for (let i = 0; i < filenames.length; i++) {
            const absolute = filenames[i];
            const relative = this.getRelativeFilename(filenames[i], roots);
            const dirname =  path.dirname(relative);
            const basename = path.basename(relative);
            const result = pattern.exec(basename);

            if (result == null) {
                restMap.set(path.join(dirname, '/' + basename), absolute);
                continue;
            }

            const { name, extname } = result.groups || {};

            if (extname === '.js') {
                scriptsMap.set(path.join(dirname, '/' + name), relative);
            }
            else {
                stylesMap.set(path.join(dirname, '/' + name), relative);
            }
        }

        return {
            scriptsMap,
            stylesMap,
            restMap
        };
    }

    /**
     * @param {String}  serializedKey
     * @param {Object}  appLocals
     * @param {Object}  reqLocals
     * @param {Object}  resLocals
     * @param {Object}  globalProps
     * @return {Object}
     */
    static getSerializedProps(serializedKey, appLocals = {}, reqLocals = {}, resLocals = {}, globalProps = {}) {
        const $serialized = _.assignIn({}, appLocals[serializedKey] || {}, reqLocals[serializedKey] || {}, resLocals[serializedKey] || {}, globalProps || {});
        const keys = Object.keys($serialized);
        const serializedProps = {};

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];

            if (globalProps.hasOwnProperty(key) === true) {
                serializedProps[key] = globalProps[key];
            }
            else if (resLocals.hasOwnProperty(key) === true) {
                serializedProps[key] = resLocals[key];
            }
            else if (reqLocals.hasOwnProperty(key) === true) {
                serializedProps[key] = reqLocals[key];
            }
            else if (appLocals.hasOwnProperty(key) === true) {
                serializedProps[key] = appLocals[key];
            }
        }

        return serializedProps;
    }

    /**
     * @param {String} filename
     * @param {ExpressSvelteRenderOptions} [opts]
     * @return {String}
     */
    static async buildTemplateByFilename(filename, opts) {
        const env = opts.env || NODE_ENV_DEVELOPMENT;
        const dev = opts.dev != null ? opts.dev : env === NODE_ENV_DEVELOPMENT || env === NODE_ENV_TESTING;
        const cache = opts.cache != null ? opts.cache : dev === false;

        let template = cache === true ? _templateCacheMap.get(filename) : null;

        if (template != null) {
            return template;
        }

        template = await fs.readFile(filename, { encoding: 'utf-8' });
        template = this.buildTemplate(template);

        if (cache === true) {
            _templateCacheMap.set(filename, template);
        }

        return template;
    }

    /**
     * @param templateString
     * @return {Promise<Function>}
     */
    static async buildTemplate(templateString) {
        return _.template(templateString, { imports: { devalue } } );
    }
}

module.exports = Utils;