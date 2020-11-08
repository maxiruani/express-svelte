<script>
    import { setContext } from 'svelte';
    import { writable } from 'svelte/store';

    export let component;
    export let props = {};

    export let globalAssets = {};
    export let globalProps = {};
    export let globalStore = {};

    globalAssets.host = globalAssets.host || '';
    globalAssets.scripts = globalAssets.scripts || new Map();
    globalAssets.styles = globalAssets.styles || new Map();

    setContext('global.assets', globalAssets);
    setContext('global.props', globalProps);
    setContext('global.store', writable(globalStore));
</script>

<svelte:component this={component} {...props} />