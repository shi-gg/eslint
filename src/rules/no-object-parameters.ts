import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, ESLintUtils } from "@typescript-eslint/utils";

import { lexicalTypeParameterNames } from "./shared/lexical-type-parameters.js";

const REGEX = /\s*:\s*object\s*$/u;

// eslint-disable-next-line new-cap
const createRule = ESLintUtils.RuleCreator(
    (name) => `https://example.com/rule/${name}`
);

type Parameter = TSESTree.Parameter | TSESTree.AssignmentPattern | TSESTree.RestElement;
type ParameterOwner =
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

function parameterAnnotation(parameter: Parameter): TSESTree.TSTypeAnnotation | undefined {
    if (parameter.type === AST_NODE_TYPES.TSParameterProperty) {
        return parameterAnnotation(parameter.parameter);
    }
    if (parameter.type === AST_NODE_TYPES.RestElement) {
        return parameter.typeAnnotation ?? parameterAnnotation(parameter.argument as TSESTree.Parameter);
    }
    if (parameter.type === AST_NODE_TYPES.AssignmentPattern) {
        return parameter.typeAnnotation ?? parameter.left.typeAnnotation;
    }
    return parameter.typeAnnotation;
}

function parameterName(parameter: Parameter, sourceCode: Readonly<TSESLint.SourceCode>): string {
    return parameter.type === AST_NODE_TYPES.Identifier
        ? parameter.name
        : sourceCode.getText(parameter).replace(REGEX, "");
}

/** Ban the broad object type on function inputs, including local aliases to object. */
export const noObjectParameters = createRule({
    name: "no-object-parameters",
    meta: {
        type: "problem",
        docs: {
            description:
                "Disallow object function parameters; inputs must use an owner-provided type and be parsed at their boundary."
        },
        messages: {
            objectParameter:
                "Parameter `{{parameter}}` uses the broad `object` type. Accept a named owner type; parse external input at its boundary before calling this function."
        },
        schema: []
    },
    defaultOptions: [],
    create(context) {
        const aliases = new Map<string, TSESTree.TypeNode>();

        const resolvesToObject = (
            type: TSESTree.TypeNode,
            shadowedAliases: ReadonlySet<string>,
            visited = new Set<string>()
        ): boolean => {
            if (type.type === AST_NODE_TYPES.TSObjectKeyword) return true;
            if (type.type === AST_NODE_TYPES.TSUnionType) {
                return type.types.some((member) =>
                    resolvesToObject(member, shadowedAliases, visited)
                );
            }
            if (
                type.type !== AST_NODE_TYPES.TSTypeReference ||
                type.typeName.type !== AST_NODE_TYPES.Identifier ||
                (type.typeArguments !== undefined && type.typeArguments.params.length > 0) ||
                visited.has(type.typeName.name) ||
                shadowedAliases.has(type.typeName.name)
            ) {
                return false;
            }
            const alias = aliases.get(type.typeName.name);
            if (alias === undefined) return false;
            const nextVisited = new Set(visited);
            nextVisited.add(type.typeName.name);
            return resolvesToObject(alias, shadowedAliases, nextVisited);
        };

        const checkParameters = (node: ParameterOwner) => {
            const shadowedAliases = lexicalTypeParameterNames(
                node,
                context.sourceCode.visitorKeys
            );
            for (const parameter of node.params) {
                const annotation = parameterAnnotation(parameter);
                if (annotation === undefined) continue;
                if (!resolvesToObject(annotation.typeAnnotation, shadowedAliases)) continue;
                context.report({
                    node: annotation.typeAnnotation,
                    messageId: "objectParameter",
                    data: { parameter: parameterName(parameter, context.sourceCode) }
                });
            }
        };

        return {
            Program(node) {
                aliases.clear();
                for (const statement of node.body) {
                    const declaration =
                        statement.type === AST_NODE_TYPES.ExportNamedDeclaration ? statement.declaration : statement;
                    if (
                        declaration?.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
                        declaration.typeParameters === undefined
                    ) {
                        aliases.set(declaration.id.name, declaration.typeAnnotation);
                    }
                }
            },
            ArrowFunctionExpression: checkParameters,
            FunctionDeclaration: checkParameters,
            FunctionExpression: checkParameters,
            TSCallSignatureDeclaration: checkParameters,
            TSConstructSignatureDeclaration: checkParameters,
            TSConstructorType: checkParameters,
            TSDeclareFunction: checkParameters,
            TSEmptyBodyFunctionExpression: checkParameters,
            TSFunctionType: checkParameters,
            TSMethodSignature: checkParameters
        };
    }
});