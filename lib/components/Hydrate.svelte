<script>
    import { getContext, setContext } from 'svelte';

    const isParentHydrated = getContext('_HYDRATION_ENABLED_') || false;

    export let component;
    export let props = {};

    // If no parent was hydrated, we should hydrate this component and set the context to inform children of hydration
    if (isParentHydrated === false) {
        setContext('_HYDRATION_ENABLED_', true);
    }
    else {
        console.warn('%s Component is being wrapped with <Hydrate /> twice. props:%s', component.name, JSON.stringify(props));
    }
</script>

{#if isParentHydrated === false}
    {@html `<script type="application/hydrate-start" data-props="${JSON.stringify(props)}"></script>`}
{/if}

<svelte:component this={component} {...props} />

{#if isParentHydrated === false}
    {@html `<script type="application/hydrate-end"></script>`}
{/if}