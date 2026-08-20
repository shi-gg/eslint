import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, ESLintUtils } from "@typescript-eslint/utils";

// eslint-disable-next-line new-cap
const createRule = ESLintUtils.RuleCreator(
    (name) => `https://example.com/rule/${name}`
);

const moduleMockMethods = new Set(["doMock", "mock", "unstable_mockModule"]);

function resolveVariable(
    sourceCode: Readonly<TSESLint.SourceCode>,
    identifier: TSESTree.Identifier
): TSESLint.Scope.Variable | null {
    let scope: TSESLint.Scope.Scope | null = sourceCode.getScope(identifier);
    while (scope !== null) {
        const variable = scope.set.get(identifier.name);
        if (variable !== undefined) return variable;
        scope = scope.upper;
    }
    return null;
}

function importedName(node: TSESTree.Node): string | null {
    if (node.type !== AST_NODE_TYPES.ImportSpecifier) return null;
    return node.imported.type === AST_NODE_TYPES.Identifier ? node.imported.name : node.imported.value;
}

function isTestFrameworkObject(
    sourceCode: Readonly<TSESLint.SourceCode>,
    expression: TSESTree.Expression
): expression is TSESTree.Identifier {
    if (expression.type !== AST_NODE_TYPES.Identifier) return false;

    const variable = resolveVariable(sourceCode, expression);
    if (variable === null || variable.defs.length === 0) {
        return expression.name === "vi" || expression.name === "jest";
    }
    return variable.defs.some((definition) => {
        if (definition.type !== "ImportBinding" || definition.parent?.type !== AST_NODE_TYPES.ImportDeclaration) {
            return false;
        }
        const source = definition.parent.source.value;
        const name = importedName(definition.node);
        return (source === "vitest" && name === "vi") || (source === "@jest/globals" && name === "jest");
    });
}

function moduleMockCall(sourceCode: Readonly<TSESLint.SourceCode>, callee: TSESTree.Expression): boolean {
    if (callee.type !== AST_NODE_TYPES.MemberExpression) return false;
    if (!isTestFrameworkObject(sourceCode, callee.object)) return false;
    const { property } = callee;
    let method: string | null = null;
    if (callee.computed) {
        method =
            property.type === AST_NODE_TYPES.Literal &&
            (property.value === "doMock" ||
                property.value === "mock" ||
                property.value === "unstable_mockModule")
                ? property.value
                : null;
    } else if (property.type === AST_NODE_TYPES.Identifier) {
        method = property.name;
    }
    return method !== null && moduleMockMethods.has(method);
}

/** Ban test framework module mocking in favor of real dependency seams. */
export const noModuleMocking = createRule({
    name: "no-module-mocking",
    meta: {
        type: "problem",
        docs: {
            description:
                "Disallow Vitest and Jest module mocking; tests must replace dependencies through real interfaces."
        },
        messages: {
            moduleMock:
                "Replace module mocking with dependency injection through a real interface, service layer, or faithful test implementation."
        },
        schema: []
    },
    defaultOptions: [],
    create(context) {
        return {
            CallExpression(node) {
                if (node.callee.type === AST_NODE_TYPES.Super) return;
                if (moduleMockCall(context.sourceCode, node.callee)) {
                    context.report({ node, messageId: "moduleMock" });
                }
            }
        };
    }
});