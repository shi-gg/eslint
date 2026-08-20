import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, ESLintUtils } from "@typescript-eslint/utils";

// eslint-disable-next-line new-cap
const createRule = ESLintUtils.RuleCreator(
    (name) => `https://example.com/rule/${name}`
);

type TypeAssertionExpression = TSESTree.TSAsExpression | TSESTree.TSTypeAssertion;

function isTypeAssertionExpression(node: TSESTree.Node): node is TypeAssertionExpression {
    return node.type === AST_NODE_TYPES.TSAsExpression || node.type === AST_NODE_TYPES.TSTypeAssertion;
}

function isConstAssertion(node: TypeAssertionExpression): boolean {
    const { typeAnnotation } = node;
    return (
        typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
        typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
        typeAnnotation.typeName.name === "const"
    );
}

function isOutermostAssertionInChain(node: TypeAssertionExpression): boolean {
    const { parent } = node;
    return !isTypeAssertionExpression(parent) || parent.expression !== node;
}

function isForbiddenAssertionChain(node: TypeAssertionExpression): boolean {
    let assertionCount = 0;
    let hasNonConstAssertion = false;
    let current: TSESTree.Expression = node;

    while (isTypeAssertionExpression(current)) {
        assertionCount += 1;
        hasNonConstAssertion ||= !isConstAssertion(current);
        current = current.expression;
    }

    return assertionCount > 1 && hasNonConstAssertion;
}

/** Disallow nested TypeScript type assertions, while permitting chains made only of const assertions. */
export const noChainedTypeAssertions = createRule({
    name: "no-chained-type-assertions",
    meta: {
        type: "problem",
        docs: {
            description:
                "Disallow chained TypeScript as and angle-bracket assertions, including parenthesized chains."
        },
        messages: {
            chained:
                "This assertion chain discards type evidence. Keep the original precise type, or parse untrusted input at its boundary before narrowing it."
        },
        schema: []
    },
    defaultOptions: [],
    create(context) {
        const checkTypeAssertion = (node: TypeAssertionExpression) => {
            if (!isOutermostAssertionInChain(node) || !isForbiddenAssertionChain(node)) return;
            context.report({ node, messageId: "chained" });
        };

        return {
            TSAsExpression: checkTypeAssertion,
            TSTypeAssertion: checkTypeAssertion
        };
    }
});