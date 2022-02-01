<script context="module">
    const Component = null;

    /**
     * @param {Object} params
     * @param {Object} params.props
     * @param {Object} params.globalProps
     * @param {Object} params.globalStores
     * @return {Promise<void>}
     */
    export async function load(params) {
        if (Component != null && Component.load != null) {
            await Component.load(params);
        }
    }
</script>

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

            // TODO: Only create store if it is not one already (must have subscribe() and unsubscribe() fns)

            output[key] = writable(value);
        }
        return output;
    }

    setContext('global.props', globalProps);
    setContext('global.stores', _createStores(globalStores));
    setContext('global.ally', {});
</script>

<svelte:component this={component} {...props} />