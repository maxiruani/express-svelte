(function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function exclude_internal_props(props) {
        const result = {};
        for (const k in props)
            if (k[0] !== '$')
                result[k] = props[k];
        return result;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function claim_element(nodes, name, attributes, svg) {
        for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (node.nodeName === name) {
                let j = 0;
                const remove = [];
                while (j < node.attributes.length) {
                    const attribute = node.attributes[j++];
                    if (!attributes[attribute.name]) {
                        remove.push(attribute.name);
                    }
                }
                for (let k = 0; k < remove.length; k++) {
                    node.removeAttribute(remove[k]);
                }
                return nodes.splice(i, 1)[0];
            }
        }
        return svg ? svg_element(name) : element(name);
    }
    function claim_text(nodes, data) {
        for (let i = 0; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (node.nodeType === 3) {
                node.data = '' + data;
                return nodes.splice(i, 1)[0];
            }
        }
        return text(data);
    }
    function claim_space(nodes) {
        return claim_text(nodes, ' ');
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function setContext(key, context) {
        get_current_component().$$.context.set(key, context);
    }
    function getContext(key) {
        return get_current_component().$$.context.get(key);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    function get_spread_update(levels, updates) {
        const update = {};
        const to_null_out = {};
        const accounted_for = { $$scope: 1 };
        let i = levels.length;
        while (i--) {
            const o = levels[i];
            const n = updates[i];
            if (n) {
                for (const key in o) {
                    if (!(key in n))
                        to_null_out[key] = 1;
                }
                for (const key in n) {
                    if (!accounted_for[key]) {
                        update[key] = n[key];
                        accounted_for[key] = 1;
                    }
                }
                levels[i] = n;
            }
            else {
                for (const key in o) {
                    accounted_for[key] = 1;
                }
            }
        }
        for (const key in to_null_out) {
            if (!(key in update))
                update[key] = undefined;
        }
        return update;
    }
    function get_spread_object(spread_props) {
        return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
    }
    function create_component(block) {
        block && block.c();
    }
    function claim_component(block, parent_nodes) {
        block && block.l(parent_nodes);
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.24.1' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* example/views/Page.svelte generated by Svelte v3.24.1 */
    const file = "example/views/Page.svelte";

    function create_fragment(ctx) {
    	let div;
    	let h1;
    	let t0;
    	let t1;
    	let h50;
    	let t2;
    	let t3;
    	let pre0;
    	let t4_value = JSON.stringify(/*$globalStore*/ ctx[0], null, 2) + "";
    	let t4;
    	let t5;
    	let h51;
    	let t6;
    	let t7;
    	let pre1;
    	let t8_value = JSON.stringify(/*globalProps*/ ctx[2], null, 2) + "";
    	let t8;
    	let t9;
    	let h52;
    	let t10;
    	let t11;
    	let pre2;
    	let t12_value = JSON.stringify(/*$$props*/ ctx[6], null, 2) + "";
    	let t12;
    	let t13;
    	let button0;
    	let t14;
    	let t15;
    	let button1;
    	let t16;
    	let t17;
    	let button2;
    	let t18;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			h1 = element("h1");
    			t0 = text("Svelte Page");
    			t1 = space();
    			h50 = element("h5");
    			t2 = text("Store props");
    			t3 = space();
    			pre0 = element("pre");
    			t4 = text(t4_value);
    			t5 = space();
    			h51 = element("h5");
    			t6 = text("Global props");
    			t7 = space();
    			pre1 = element("pre");
    			t8 = text(t8_value);
    			t9 = space();
    			h52 = element("h5");
    			t10 = text("View props");
    			t11 = space();
    			pre2 = element("pre");
    			t12 = text(t12_value);
    			t13 = space();
    			button0 = element("button");
    			t14 = text("Increase store count +");
    			t15 = space();
    			button1 = element("button");
    			t16 = text("Decrease store count -");
    			t17 = space();
    			button2 = element("button");
    			t18 = text("Reset store count");
    			this.h();
    		},
    		l: function claim(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);
    			h1 = claim_element(div_nodes, "H1", {});
    			var h1_nodes = children(h1);
    			t0 = claim_text(h1_nodes, "Svelte Page");
    			h1_nodes.forEach(detach_dev);
    			t1 = claim_space(div_nodes);
    			h50 = claim_element(div_nodes, "H5", {});
    			var h50_nodes = children(h50);
    			t2 = claim_text(h50_nodes, "Store props");
    			h50_nodes.forEach(detach_dev);
    			t3 = claim_space(div_nodes);
    			pre0 = claim_element(div_nodes, "PRE", {});
    			var pre0_nodes = children(pre0);
    			t4 = claim_text(pre0_nodes, t4_value);
    			pre0_nodes.forEach(detach_dev);
    			t5 = claim_space(div_nodes);
    			h51 = claim_element(div_nodes, "H5", {});
    			var h51_nodes = children(h51);
    			t6 = claim_text(h51_nodes, "Global props");
    			h51_nodes.forEach(detach_dev);
    			t7 = claim_space(div_nodes);
    			pre1 = claim_element(div_nodes, "PRE", {});
    			var pre1_nodes = children(pre1);
    			t8 = claim_text(pre1_nodes, t8_value);
    			pre1_nodes.forEach(detach_dev);
    			t9 = claim_space(div_nodes);
    			h52 = claim_element(div_nodes, "H5", {});
    			var h52_nodes = children(h52);
    			t10 = claim_text(h52_nodes, "View props");
    			h52_nodes.forEach(detach_dev);
    			t11 = claim_space(div_nodes);
    			pre2 = claim_element(div_nodes, "PRE", {});
    			var pre2_nodes = children(pre2);
    			t12 = claim_text(pre2_nodes, t12_value);
    			pre2_nodes.forEach(detach_dev);
    			t13 = claim_space(div_nodes);
    			button0 = claim_element(div_nodes, "BUTTON", { type: true });
    			var button0_nodes = children(button0);
    			t14 = claim_text(button0_nodes, "Increase store count +");
    			button0_nodes.forEach(detach_dev);
    			t15 = claim_space(div_nodes);
    			button1 = claim_element(div_nodes, "BUTTON", { type: true });
    			var button1_nodes = children(button1);
    			t16 = claim_text(button1_nodes, "Decrease store count -");
    			button1_nodes.forEach(detach_dev);
    			t17 = claim_space(div_nodes);
    			button2 = claim_element(div_nodes, "BUTTON", { type: true });
    			var button2_nodes = children(button2);
    			t18 = claim_text(button2_nodes, "Reset store count");
    			button2_nodes.forEach(detach_dev);
    			div_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			add_location(h1, file, 42, 4, 863);
    			add_location(h50, file, 44, 4, 889);
    			add_location(pre0, file, 45, 4, 914);
    			add_location(h51, file, 47, 4, 970);
    			add_location(pre1, file, 48, 4, 996);
    			add_location(h52, file, 50, 4, 1051);
    			add_location(pre2, file, 51, 4, 1075);
    			attr_dev(button0, "type", "button");
    			add_location(button0, file, 53, 4, 1126);
    			attr_dev(button1, "type", "button");
    			add_location(button1, file, 56, 4, 1219);
    			attr_dev(button2, "type", "button");
    			add_location(button2, file, 59, 4, 1312);
    			attr_dev(div, "class", "Page svelte-14hz3qb");
    			add_location(div, file, 40, 0, 839);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, h1);
    			append_dev(h1, t0);
    			append_dev(div, t1);
    			append_dev(div, h50);
    			append_dev(h50, t2);
    			append_dev(div, t3);
    			append_dev(div, pre0);
    			append_dev(pre0, t4);
    			append_dev(div, t5);
    			append_dev(div, h51);
    			append_dev(h51, t6);
    			append_dev(div, t7);
    			append_dev(div, pre1);
    			append_dev(pre1, t8);
    			append_dev(div, t9);
    			append_dev(div, h52);
    			append_dev(h52, t10);
    			append_dev(div, t11);
    			append_dev(div, pre2);
    			append_dev(pre2, t12);
    			append_dev(div, t13);
    			append_dev(div, button0);
    			append_dev(button0, t14);
    			append_dev(div, t15);
    			append_dev(div, button1);
    			append_dev(button1, t16);
    			append_dev(div, t17);
    			append_dev(div, button2);
    			append_dev(button2, t18);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*increment*/ ctx[3], false, false, false),
    					listen_dev(button1, "click", /*decrement*/ ctx[4], false, false, false),
    					listen_dev(button2, "click", /*reset*/ ctx[5], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*$globalStore*/ 1 && t4_value !== (t4_value = JSON.stringify(/*$globalStore*/ ctx[0], null, 2) + "")) set_data_dev(t4, t4_value);
    			if (dirty & /*$$props*/ 64 && t12_value !== (t12_value = JSON.stringify(/*$$props*/ ctx[6], null, 2) + "")) set_data_dev(t12, t12_value);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let $globalStore;
    	const globalStore = getContext("global.store");
    	validate_store(globalStore, "globalStore");
    	component_subscribe($$self, globalStore, value => $$invalidate(0, $globalStore = value));
    	const globalProps = getContext("global.props");

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
    			store.count = 0;
    			return store;
    		});
    	}

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Page", $$slots, []);

    	$$self.$$set = $$new_props => {
    		$$invalidate(6, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
    	};

    	$$self.$capture_state = () => ({
    		getContext,
    		globalStore,
    		globalProps,
    		increment,
    		decrement,
    		reset,
    		$globalStore
    	});

    	$$self.$inject_state = $$new_props => {
    		$$invalidate(6, $$props = assign(assign({}, $$props), $$new_props));
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$props = exclude_internal_props($$props);
    	return [$globalStore, globalStore, globalProps, increment, decrement, reset, $$props];
    }

    class Page extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Page",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    /* lib/components/ViewGlobals.svelte generated by Svelte v3.24.1 */

    function create_fragment$1(ctx) {
    	let switch_instance;
    	let switch_instance_anchor;
    	let current;
    	const switch_instance_spread_levels = [/*componentProps*/ ctx[1]];
    	var switch_value = /*component*/ ctx[0];

    	function switch_props(ctx) {
    		let switch_instance_props = {};

    		for (let i = 0; i < switch_instance_spread_levels.length; i += 1) {
    			switch_instance_props = assign(switch_instance_props, switch_instance_spread_levels[i]);
    		}

    		return {
    			props: switch_instance_props,
    			$$inline: true
    		};
    	}

    	if (switch_value) {
    		switch_instance = new switch_value(switch_props());
    	}

    	const block = {
    		c: function create() {
    			if (switch_instance) create_component(switch_instance.$$.fragment);
    			switch_instance_anchor = empty();
    		},
    		l: function claim(nodes) {
    			if (switch_instance) claim_component(switch_instance.$$.fragment, nodes);
    			switch_instance_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (switch_instance) {
    				mount_component(switch_instance, target, anchor);
    			}

    			insert_dev(target, switch_instance_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const switch_instance_changes = (dirty & /*componentProps*/ 2)
    			? get_spread_update(switch_instance_spread_levels, [get_spread_object(/*componentProps*/ ctx[1])])
    			: {};

    			if (switch_value !== (switch_value = /*component*/ ctx[0])) {
    				if (switch_instance) {
    					group_outros();
    					const old_component = switch_instance;

    					transition_out(old_component.$$.fragment, 1, 0, () => {
    						destroy_component(old_component, 1);
    					});

    					check_outros();
    				}

    				if (switch_value) {
    					switch_instance = new switch_value(switch_props());
    					create_component(switch_instance.$$.fragment);
    					transition_in(switch_instance.$$.fragment, 1);
    					mount_component(switch_instance, switch_instance_anchor.parentNode, switch_instance_anchor);
    				} else {
    					switch_instance = null;
    				}
    			} else if (switch_value) {
    				switch_instance.$set(switch_instance_changes);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			if (switch_instance) transition_in(switch_instance.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			if (switch_instance) transition_out(switch_instance.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(switch_instance_anchor);
    			if (switch_instance) destroy_component(switch_instance, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { component } = $$props;
    	let { componentProps = {} } = $$props;
    	let { globalAssets = {} } = $$props;
    	let { globalProps = {} } = $$props;
    	let { globalStore = {} } = $$props;
    	globalAssets.host = globalAssets.host || "";
    	globalAssets.scripts = globalAssets.scripts || new Map();
    	globalAssets.styles = globalAssets.styles || new Map();
    	setContext("global.assets", globalAssets);
    	setContext("global.props", globalProps);
    	setContext("global.store", writable(globalStore));
    	const writable_props = ["component", "componentProps", "globalAssets", "globalProps", "globalStore"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<ViewGlobals> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("ViewGlobals", $$slots, []);

    	$$self.$$set = $$props => {
    		if ("component" in $$props) $$invalidate(0, component = $$props.component);
    		if ("componentProps" in $$props) $$invalidate(1, componentProps = $$props.componentProps);
    		if ("globalAssets" in $$props) $$invalidate(2, globalAssets = $$props.globalAssets);
    		if ("globalProps" in $$props) $$invalidate(3, globalProps = $$props.globalProps);
    		if ("globalStore" in $$props) $$invalidate(4, globalStore = $$props.globalStore);
    	};

    	$$self.$capture_state = () => ({
    		setContext,
    		writable,
    		component,
    		componentProps,
    		globalAssets,
    		globalProps,
    		globalStore
    	});

    	$$self.$inject_state = $$props => {
    		if ("component" in $$props) $$invalidate(0, component = $$props.component);
    		if ("componentProps" in $$props) $$invalidate(1, componentProps = $$props.componentProps);
    		if ("globalAssets" in $$props) $$invalidate(2, globalAssets = $$props.globalAssets);
    		if ("globalProps" in $$props) $$invalidate(3, globalProps = $$props.globalProps);
    		if ("globalStore" in $$props) $$invalidate(4, globalStore = $$props.globalStore);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [component, componentProps, globalAssets, globalProps, globalStore];
    }

    class ViewGlobals extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
    			component: 0,
    			componentProps: 1,
    			globalAssets: 2,
    			globalProps: 3,
    			globalStore: 4
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ViewGlobals",
    			options,
    			id: create_fragment$1.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*component*/ ctx[0] === undefined && !("component" in props)) {
    			console.warn("<ViewGlobals> was created without expected prop 'component'");
    		}
    	}

    	get component() {
    		throw new Error("<ViewGlobals>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set component(value) {
    		throw new Error("<ViewGlobals>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get componentProps() {
    		throw new Error("<ViewGlobals>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set componentProps(value) {
    		throw new Error("<ViewGlobals>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get globalAssets() {
    		throw new Error("<ViewGlobals>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set globalAssets(value) {
    		throw new Error("<ViewGlobals>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get globalProps() {
    		throw new Error("<ViewGlobals>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set globalProps(value) {
    		throw new Error("<ViewGlobals>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get globalStore() {
    		throw new Error("<ViewGlobals>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set globalStore(value) {
    		throw new Error("<ViewGlobals>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const app = new ViewGlobals({
        target: document.body,
        hydrate: true,
        props: {
            globalProps: window._GLOBAL_PROPS_ || {},
            globalStore: window._GLOBAL_STORE_ || {},
            component: Page,
            componentProps: window._PROPS_ || {}
        }
    });

}());
//# sourceMappingURL=Page.js.map
