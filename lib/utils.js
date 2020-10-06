'use strict';

const path = require('path');
const fs = require('fs');
const _ = require('lodash');

const ERROR_EXPRESS_SVELTE_INVALID_PATTERN = 'ERROR_EXPRESS_SVELTE_INVALID_PATTERN';
const PATTERN_SPLIT = /(\[name]\[hash]|\[extname])/;

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

        const viewExtension = path.extname(name);
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
     * @param {Object} dirname
     * @return {String[]}
     */
    static getFilenames(dirname) {
        const dirents = fs.readdirSync(dirname, { withFileTypes: true });
        const files = dirents.map(dirent => {
            const res = path.resolve(dirname, dirent.name);
            return dirent.isDirectory() ? Utils.getFilenames(res) : res;
        });
        return files.flat();
    }

    /**
     * @param {String} patternStr
     * @return {RegExp}
     */
    static getFilenameRegExp(patternStr) {
        if (patternStr.endsWith('[extname]') === false) {
            const err = new Error(`Invalid pattern "${patternStr}". Must end with [extname]`);
            err.code = ERROR_EXPRESS_SVELTE_INVALID_PATTERN;
            throw err;
        }
        if (patternStr.includes('[name]') === false) {
            const err = new Error(`Invalid pattern "${patternStr}". Must contain [name]`);
            err.code = ERROR_EXPRESS_SVELTE_INVALID_PATTERN;
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
     * @param {String[]} filenames
     * @param {RegExp} pattern
     * @return {Object}
     */
    static getFilenamesMaps(filenames, pattern) {
        const scriptsMap = new Map();
        const stylesMap = new Map();
        const restMap = new Map();

        for (let i = 0; i < filenames.length; i++) {
            const filename = filenames[i];
            const basename = path.basename(filename);
            const result = pattern.exec(basename);

            if (result == null) {
                restMap.set(basename, filename);
                continue;
            }

            const { name, extname } = result.groups || {};

            if (extname === '.js') {
                scriptsMap.set(name, filename);
            }
            else {
                stylesMap.set(name, filename);
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
    static getSerializedProps(serializedKey, appLocals, reqLocals, resLocals, globalProps) {
        const $serialized = _.assignIn({}, appLocals[serializedKey] || {}, reqLocals[serializedKey] || {}, resLocals[serializedKey] || {}, globalProps[serializedKey] || {});
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
}

module.exports = Utils;