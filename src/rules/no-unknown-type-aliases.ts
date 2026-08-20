import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, ESLintUtils } from "@typescript-eslint/utils";

// eslint-disable-next-line new-cap
const createRule = ESLintUtils.RuleCreator(
    (name) => `https://example.com/rule/${name}`
);

function referencedAliasName(type: TSESTree.TypeNode): string | null {
    if (type.type !== AST_NODE_TYPES.TSTypeReference || type.typeName.type !== AST_NODE_TYPES.Identifier) return null;
    return type.typeArguments === undefined || type.typeArguments.params.length === 0
        ? type.typeName.name
        : null;
}

/** Ban named aliases that merely conceal TypeScript's unknown top type. */
export const noUnknownTypeAliases = createRule({
    name: "no-unknown-type-aliases",
    meta: {
        type: "problem",
        docs: {
            description:
                "Disallow type aliases whose resolved type is unknown; unknown must remain visible at an allowed boundary."
        },
        messages: {
            unknownAlias:
                "Type alias `{{alias}}` hides `unknown`. Keep `unknown` explicit at the parsing boundary or on an allowed `cause` field; otherwise use the parsed owner type."
        },
        schema: []
    },
    defaultOptions: [],
    create(context) {
        const aliases = new Map<string, TSESTree.TSTypeAliasDeclaration>();

        const resolvesToUnknown = (type: TSESTree.TypeNode, visited = new Set<string>()): boolean => {
            if (type.type === AST_NODE_TYPES.TSUnknownKeyword) return true;
            const name = referencedAliasName(type);
            if (name === null || visited.has(name)) return false;
            const alias = aliases.get(name);
            if (alias === undefined || alias.typeParameters !== undefined) {
                return false;
            }
            const nextVisited = new Set(visited);
            nextVisited.add(name);
            return resolvesToUnknown(alias.typeAnnotation, nextVisited);
        };

        return {
            Program(node) {
                aliases.clear();
                for (const statement of node.body) {
                    const declaration =
                        statement.type === AST_NODE_TYPES.ExportNamedDeclaration ? statement.declaration : statement;
                    if (declaration?.type === AST_NODE_TYPES.TSTypeAliasDeclaration) {
                        aliases.set(declaration.id.name, declaration);
                    }
                }
                for (const alias of aliases.values()) {
                    if (!resolvesToUnknown(alias.typeAnnotation, new Set([alias.id.name]))) continue;
                    context.report({
                        node: alias.id,
                        messageId: "unknownAlias",
                        data: { alias: alias.id.name }
                    });
                }
            }
        };
    }
});