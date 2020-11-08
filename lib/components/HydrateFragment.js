
class HydrateFragment {

    /**
     * @param {Object} opts
     * @param {NodeList[]} opts.children
     */
    constructor(opts) {
        this.childNodes = opts.children || [];
        this.parentNode = this.childNodes.length > 0 ? this.childNodes[0].parentNode : null;
        this.previousSibling = this.childNodes.length > 0 ? this.childNodes[0].previousSibling : null;
        this.nextSibling = this.childNodes.length > 0 ? this.childNodes[this.childNodes.length - 1].nextSibling : null;
    }

    /**
     * @param {Node} node
     */
    appendChild(node) {
        this.parentNode.insertBefore(node, this.nextSibling);
    }

    /**
     * @param {Node} node
     * @param {Node|null=} anchor
     */
    insertBefore(node, anchor) {
        this.parentNode.insertBefore(node, anchor);
    }
}

export default HydrateFragment;