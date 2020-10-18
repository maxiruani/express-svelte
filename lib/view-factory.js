'use strict';

const fs = require('fs-extra');
const crypto = require('crypto');

const TMP_DIRNAME = __dirname + '/.tmp';
const VIEW_GLOBALS_COMPONENT_FILENAME = __dirname + '/components/ViewGlobals.svelte';

let _cacheMap = new Map();
let _viewGlobalsComponent = null;

class ViewFactory {

    static clear() {
        _cacheMap = new Map();
        this.clearAndEnsureDirSync(TMP_DIRNAME);
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
    static async create(filename) {
        if (_viewGlobalsComponent == null) {
            _viewGlobalsComponent = await fs.readFile(VIEW_GLOBALS_COMPONENT_FILENAME, { encoding: 'utf8' });
        }

        let viewComponentFilename = _cacheMap.get(filename) || null;

        if (viewComponentFilename != null) {
            return viewComponentFilename;
        }

        const viewComponentContent = _viewGlobalsComponent.replace('export let component;', `import component from '${filename}'`);
        viewComponentFilename = TMP_DIRNAME + '/' + crypto.randomBytes(10).toString('hex') + '.svelte';

        await fs.writeFile(viewComponentFilename, viewComponentContent, { encoding: 'utf8', flag: 'w' });
        _cacheMap.set(filename, viewComponentFilename);

        return viewComponentFilename;
    }
}

module.exports = ViewFactory;