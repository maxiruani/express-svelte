
import ViewComponent from '../views/Page.svelte';
import ViewGlobals from '../../lib/components/ViewGlobals.svelte';

const app = new ViewGlobals({
    target: document.body,
    hydrate: true,
    props: {
        globalProps: window._GLOBAL_PROPS_ || {},
        globalStore: window._GLOBAL_STORE_ || {},
        component: ViewComponent,
        componentProps: window._PROPS_ || {}
    }
});