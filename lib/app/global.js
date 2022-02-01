import { getContext } from 'svelte';
import get from 'lodash.get';
import set from 'lodash.set';

export const ContextKey = {
    GLOBAL_STORES: 'global.stores',
    GLOBAL_PROPS: 'global.props',
    GLOBAL_ALLY: 'global.ally'
};

/**
 * @return {Object}
 */
export function getStores() {
    return getContext(ContextKey.GLOBAL_STORES);
}

/**
 * @param {String} key
 * @return {*|null}
 */
export function getStore(key) {
    const stores = getStores();
    return get(stores, key, null);
}

/**
 * @param {String} key
 * @param value
 */
export function setStore(key, value) {
    const stores = getStores();
    set(stores, key, value);
}

/**
 * @return {Object}
 */
export function getProps() {
    return getContext(ContextKey.GLOBAL_PROPS);
}

/**
 * @param {String} key
 * @return {*|null}
 */
export function getProp(key) {
    const props = getProps();
    return get(props, key, null);
}

/**
 * @param {String} key
 * @param value
 */
export function setProp(key, value) {
    const props = getProps();
    set(props, key, value);
}

/**
 * @param {String} [prefix]
 * @return {Number}
 */
export function nextId(prefix = null) {
    const ally = getContext(ContextKey.GLOBAL_ALLY);
    const key = prefix != null ? `prefix.${prefix}` : 'counter';

    // Get counter, increment and update
    let counter = get(ally, key) || 0;
    counter++;
    set(ally, key, counter);

    return counter;
}