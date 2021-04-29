<script>
    import { setContext } from 'svelte';
    import { writable } from 'svelte/store';

    export let component;
    export let props = {};

    export let globalAssets = {};
    export let globalProps = {};
    export let globalStores = {};

    globalAssets.host = globalAssets.host || '';
    globalAssets.scripts = globalAssets.scripts || new Map();
    globalAssets.styles = globalAssets.styles || new Map();

    function _createStores(props) {
        const entries = Object.entries(props);
        const output = {};
        for (let i = 0; i < entries.length; i++) {
            const [key, value] = entries[i];
            output[key] = writable(value);
        }
        return output;
    }

    setContext('global.assets', globalAssets);
    setContext('global.props', globalProps);
    setContext('global.stores', process.browser === false ? _createStores(globalStores) : globalStores);
</script>

<svelte:component this={component} {...props} />