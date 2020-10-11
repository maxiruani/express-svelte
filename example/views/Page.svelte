
<script>
    import { getContext } from 'svelte';

    const globalStore = getContext('global.store');
    const globalProps = getContext('global.props');

    function increment() {
        globalStore.update(store => {
            store.count = store.count != null ? store.count : 0;
            store.count++;
            return store;
        });
    }

    function decrement() {
        globalStore.update(store => {
            store.count = store.count != null ? store.count : 0;
            store.count--;
            return store;
        });
    }

    function reset() {
        globalStore.update(store => {
            store.count = 0
            return store;
        });
    }
</script>

<style>
    .Page {
        display: block;
        max-width: 600px;
        margin: 100px auto;
        padding: 0;
    }
</style>

<div class="Page">

    <h1>Svelte Page</h1>

    <h5>Store props</h5>
    <pre>{JSON.stringify($globalStore, null, 2)}</pre>

    <h5>Global props</h5>
    <pre>{JSON.stringify(globalProps, null, 2)}</pre>

    <h5>View props</h5>
    <pre>{JSON.stringify($$props, null, 2)}</pre>

    <button type="button" on:click={increment}>
        Increase store count +
    </button>
    <button type="button" on:click={decrement}>
        Decrease store count -
    </button>
    <button type="button" on:click={reset}>
        Reset store count
    </button>

</div>