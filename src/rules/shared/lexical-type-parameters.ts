import type { TSESTree } from "@typescript-eslint/utils";

type VisitorKeys = Readonly<Record<string, readonly string[]>>;

function isNode(value: unknown): value is TSESTree.Node {
    return (
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        typeof value.type === "string"
    );
}

function collectInferTypeParameterNames(
    node: TSESTree.Node,
    visitorKeys: VisitorKeys,
    names: Set<string>
): void {
    if (node.type === "TSInferType") names.add(node.typeParameter.name.name);
    for (const key of visitorKeys[node.type] ?? []) {
        const value = Object.getOwnPropertyDescriptor(node, key)?.value;
        if (isNode(value)) {
            collectInferTypeParameterNames(value, visitorKeys, names);
            continue;
        }
        if (!Array.isArray(value)) continue;
        for (const child of value) {
            if (isNode(child)) collectInferTypeParameterNames(child, visitorKeys, names);
        }
    }
}

/** Collect type binders that are in scope at a node and can shadow module aliases. */
export function lexicalTypeParameterNames(
    node: TSESTree.Node,
    visitorKeys: VisitorKeys
): ReadonlySet<string> {
    const names = new Set<string>();
    let descendant: TSESTree.Node = node;
    let current: TSESTree.Node | null = node;
    while (current !== null && current.type !== "Program") {
        if ("typeParameters" in current) {
            for (const parameter of current.typeParameters?.params ?? []) {
                names.add(parameter.name.name);
            }
        }
        if (
            current.type === "TSMappedType" &&
            (descendant === current.nameType || descendant === current.typeAnnotation)
        ) {
            names.add(current.key.name);
        }
        if (current.type === "TSConditionalType" && descendant === current.trueType) {
            collectInferTypeParameterNames(current.extendsType, visitorKeys, names);
        }
        descendant = current;
        current = current.parent;
    }
    return names;
}