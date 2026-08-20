import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, ESLintUtils } from "@typescript-eslint/utils";

import { lexicalTypeParameterNames } from "./shared/lexical-type-parameters.js";

// eslint-disable-next-line new-cap
const createRule = ESLintUtils.RuleCreator(
    (name) => `https://example.com/rule/${name}`
);

type FunctionWithReturnType =
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.TSCallSignatureDeclaration
    | TSESTree.TSConstructSignatureDeclaration
    | TSESTree.TSConstructorType
    | TSESTree.TSDeclareFunction
    | TSESTree.TSEmptyBodyFunctionExpression
    | TSESTree.TSFunctionType
    | TSESTree.TSMethodSignature;

function referencedAliasName(type: TSESTree.TypeNode): string | null {
    if (type.type !== AST_NODE_TYPES.TSTypeReference || type.typeName.type !== AST_NODE_TYPES.Identifier) return null;
    return type.typeArguments === undefined || type.typeArguments.params.length === 0
        ? type.typeName.name
        : null;
}

/** Ban function contracts that return unknown instead of a parsed domain type. */
export const noUnknownReturns = createRule({
    name: "no-unknown-returns",
    meta: {
        type: "problem",
        docs: {
            description:
                "Disallow functions whose explicit return contract is unknown or Promise<unknown>."
        },
        messages: {
            unknownReturn:
                "This function exposes `unknown` to its caller. Parse the value at its boundary and return a named domain type."
        },
        schema: []
    },
    defaultOptions: [],
    create(context) {
        const aliases = new Map<string, TSESTree.TSTypeAliasDeclaration>();

        const resolvesToUnknown = (
            type: TSESTree.TypeNode,
            shadowedAliases: ReadonlySet<string>,
            visited = new Set<string>()
        ): boolean => {
            if (type.type === AST_NODE_TYPES.TSUnknownKeyword) return true;
            if (type.type === AST_NODE_TYPES.TSUnionType) {
                return type.types.some((member) =>
                    resolvesToUnknown(member, shadowedAliases, visited)
                );
            }
            if (
                type.type === AST_NODE_TYPES.TSTypeReference &&
                type.typeName.type === AST_NODE_TYPES.Identifier &&
                (type.typeName.name === "Promise" || type.typeName.name === "PromiseLike")
            ) {
                const value = type.typeArguments?.params[0];
                return value !== undefined && resolvesToUnknown(value, shadowedAliases, visited);
            }
            const name = referencedAliasName(type);
            if (name === null || visited.has(name) || shadowedAliases.has(name)) return false;
            const alias = aliases.get(name);
            if (alias === undefined || alias.typeParameters !== undefined) {
                return false;
            }
            const nextVisited = new Set(visited);
            nextVisited.add(name);
            return resolvesToUnknown(alias.typeAnnotation, shadowedAliases, nextVisited);
        };

        const checkReturnType = (node: FunctionWithReturnType) => {
            const annotation = node.returnType;
            if (annotation === undefined) return;
            if (
                !resolvesToUnknown(
                    annotation.typeAnnotation,
                    lexicalTypeParameterNames(node, context.sourceCode.visitorKeys)
                )
            ) {
                return;
            }
            context.report({ node: annotation.typeAnnotation, messageId: "unknownReturn" });
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
            },
            ArrowFunctionExpression: checkReturnType,
            FunctionDeclaration: checkReturnType,
            FunctionExpression: checkReturnType,
            TSCallSignatureDeclaration: checkReturnType,
            TSConstructSignatureDeclaration: checkReturnType,
            TSConstructorType: checkReturnType,
            TSDeclareFunction: checkReturnType,
            TSEmptyBodyFunctionExpression: checkReturnType,
            TSFunctionType: checkReturnType,
            TSMethodSignature: checkReturnType
        };
    }
});