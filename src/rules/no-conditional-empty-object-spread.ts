import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, ESLintUtils } from "@typescript-eslint/utils";

// eslint-disable-next-line new-cap
const createRule = ESLintUtils.RuleCreator(
    (name) => `https://example.com/rule/${name}`
);

function isEmptyObjectExpression(node: TSESTree.Expression): boolean {
    return node.type === AST_NODE_TYPES.ObjectExpression && node.properties.length === 0;
}

function isConditionalEmptyObjectSpread(node: TSESTree.Expression): boolean {
    return (
        node.type === AST_NODE_TYPES.ConditionalExpression &&
        (isEmptyObjectExpression(node.consequent) ||
            isEmptyObjectExpression(node.alternate))
    );
}

/** Ban conditional empty-object spreads without changing their omission semantics. */
export const noConditionalEmptyObjectSpread = createRule({
    name: "no-conditional-empty-object-spread",
    meta: {
        type: "suggestion",
        docs: {
            description:
                "Disallow object spreads that conditionally spread an empty object to omit fields."
        },
        messages: {
            avoid:
                "This conditional spread hides property omission behind an empty object. Build the object in separate statements and add the property only when present."
        },
        schema: []
    },
    defaultOptions: [],
    create(context) {
        return {
            SpreadElement(node) {
                if (node.parent.type !== AST_NODE_TYPES.ObjectExpression) return;

                if (isConditionalEmptyObjectSpread(node.argument)) {
                    context.report({ node, messageId: "avoid" });
                }
            }
        };
    }
});