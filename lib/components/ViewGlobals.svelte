<script>
    import { setContext } from 'svelte';
    import { writable } from 'svelte/store';

    export let component;
    export let props = {};
    export let globalProps = {};
    export let globalStores = {};

    /**
     * Create stores for the first level of key-values
     * @param {Object} props
     * @return {Object}
     * @private
     */
    function _createStores(props) {
        const entries = Object.entries(props);
        const output = {};
        for (let i = 0; i < entries.length; i++) {
            const [key, value] = entries[i];
            output[key] = writable(value);
        }
        return output;
    }

    setContext('global.props', globalProps);
    setContext('global.stores', _createStores(globalStores));
</script>

<svelte:component this={component} {...props} />