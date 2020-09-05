'use strict';

const path = require('path');
const fs = require('fs').promises;

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


    static buildGlobalProps(appLocals, resLocals, globalProps) {

        // $serialized
        // $serialized


    }
}

module.exports = Utils;