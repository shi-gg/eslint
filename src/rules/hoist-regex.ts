import { AST_NODE_TYPES, ESLintUtils } from "@typescript-eslint/utils";

// eslint-disable-next-line new-cap
const createRule = ESLintUtils.RuleCreator(
    (name) => `https://example.com/rule/${name}`
);

export const hoistRegex = createRule({
    name: "hoist-regex",
    meta: {
        type: "suggestion",
        docs: {
            description: "Enforce hoisting of regex literals"
        },
        messages: {
            hoistRegex: "Regex literals should be hoisted to the top level."
        },
        fixable: "code",
        schema: []
    },
    defaultOptions: [],
    create(context) {
        return {
            Literal(node) {
                if (!("regex" in node)) return;

                const ancestors = context.sourceCode.getAncestors(node);
                const parent = ancestors.at(-1);

                // Check if already hoisted:
                if (
                    parent?.type === AST_NODE_TYPES.VariableDeclarator &&
                    parent.init === node
                ) {
                    const grandParent = ancestors.at(-2);
                    if (
                        grandParent?.type === AST_NODE_TYPES.VariableDeclaration &&
                        grandParent.kind === "const" &&
                        (grandParent.parent?.type === AST_NODE_TYPES.Program ||
                            grandParent.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration)
                    ) {
                        return;
                    }
                }

                context.report({
                    node,
                    messageId: "hoistRegex",
                    fix(fixer) {
                        const regexText = context.sourceCode.getText(node);

                        let name = "REGEX";
                        let count = 0;

                        const scope = context.sourceCode.getScope(node);
                        let moduleScope = scope;
                        while (moduleScope.type !== "module" && moduleScope.type !== "global" && moduleScope.upper) {
                            moduleScope = moduleScope.upper;
                        }

                        const isNameTaken = (n: string) => {
                            if (moduleScope.variables.some((v) => v.name === n)) return true;

                            const ref = scope.references.find((r) => r.identifier.name === n);

                            if (ref) return true;
                            if (scope.variables.some((v) => v.name === n)) return true;

                            return false;
                        };

                        while (isNameTaken(name)) {
                            count++;
                            name = `REGEX_${count}`;
                        }

                        // Find where to insert
                        const { body } = context.sourceCode.ast;
                        const lastHoistedRegex = body.findLast((n) => {
                            if (n.type === AST_NODE_TYPES.ExportNamedDeclaration && n.declaration?.type === AST_NODE_TYPES.VariableDeclaration) {
                                return n.declaration.declarations.some((d) => d.init?.type === AST_NODE_TYPES.Literal && "regex" in d.init);
                            }
                            if (n.type !== AST_NODE_TYPES.VariableDeclaration || n.kind !== "const") return false;
                            return n.declarations.some((d) => d.init?.type === AST_NODE_TYPES.Literal && "regex" in d.init);
                        });

                        if (lastHoistedRegex) {
                            return [
                                fixer.insertTextAfter(lastHoistedRegex, `\nconst ${name} = ${regexText};`),
                                fixer.replaceText(node, name)
                            ];
                        }

                        const lastImport = body.findLast((n) => n.type === AST_NODE_TYPES.ImportDeclaration);
                        const insertPos = lastImport ? lastImport.range[1] : 0;

                        return [
                            fixer.insertTextAfterRange([insertPos, insertPos], `\nconst ${name} = ${regexText};`),
                            fixer.replaceText(node, name)
                        ];
                    }
                });
            }
        };
    }
});