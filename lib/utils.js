'use strict';

const path = require('path');
const fs = require('fs').promises;
const _ = require('lodash');

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
     * @param {String} patternStr
     * @return {RegExp}
     */
    static getFilenameRegExp(patternStr) {
        const PATTERN_NAME = /\.+/g;
        const PATTERN_HASH = /[a-z0-9]{8}/g;
        const PATTERN_EXTNAME = /\.(?:js|css)$/g;

        // TODO: REGEX TO TEST PATTERN FORMAT

        // SPLIT BY REGEX !
        // [name]-[hash][extname]

        let str = patternStr;

        const variable = '[name]';
        const index = str.indexOf(variable);

        if (index >= 0) {
            str = variable.length
        }

        str = patternStr.replace('[name]', '\.+')
                        .replace('[hash]', '[a-z0-9]{8}')
                        .replace('[extname]', '\\.(?:js|css)')

        return new RegExp(`^$`);
    }

    /**
     * @param {Object}  appLocals
     * @param {Object=} appLocals.$serialized
     * @param {Object}  resLocals
     * @param {Object=} resLocals.$serialized
     * @param {Object}  globalProps
     * @param {Object=} globalProps.$serialized
     * @return {Object}
     */
    static getSerializedGlobalProps(appLocals, resLocals, globalProps) {
        const $serialized = _.assignIn({}, appLocals.$serialized, resLocals.$serialized, globalProps.$serialized);
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
            else if (appLocals.hasOwnProperty(key) === true) {
                serializedProps[key] = appLocals[key];
            }
        }

        return serializedProps;
    }
}

module.exports = Utils;