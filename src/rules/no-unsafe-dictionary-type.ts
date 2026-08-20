import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, ESLintUtils } from "@typescript-eslint/utils";

import {
    classifyUnsafeDictionary,
    classifyUnsafeDictionaryValue,
    createTypeEnvironment,
    type TypeEnvironment
} from "./shared/dictionary-types.js";

// eslint-disable-next-line new-cap
const createRule = ESLintUtils.RuleCreator(
    (name) => `https://example.com/rule/${name}`
);

const typeNodeKinds: ReadonlySet<string> = new Set([
    "JSDocNonNullableType",
    "JSDocNullableType",
    "JSDocUnknownType",
    "TSAnyKeyword",
    "TSArrayType",
    "TSBigIntKeyword",
    "TSBooleanKeyword",
    "TSConditionalType",
    "TSConstructorType",
    "TSFunctionType",
    "TSImportType",
    "TSIndexedAccessType",
    "TSInferType",
    "TSIntersectionType",
    "TSIntrinsicKeyword",
    "TSLiteralType",
    "TSMappedType",
    "TSNamedTupleMember",
    "TSNeverKeyword",
    "TSNullKeyword",
    "TSNumberKeyword",
    "TSObjectKeyword",
    "TSStringKeyword",
    "TSSymbolKeyword",
    "TSTemplateLiteralType",
    "TSThisType",
    "TSTupleType",
    "TSTypeLiteral",
    "TSTypeOperator",
    "TSTypePredicate",
    "TSTypeQuery",
    "TSTypeReference",
    "TSUndefinedKeyword",
    "TSUnionType",
    "TSUnknownKeyword",
    "TSVoidKeyword"
]);

function isTypeNode(node: TSESTree.Node): node is TSESTree.TypeNode {
    return typeNodeKinds.has(node.type);
}

function typeReferenceName(type: TSESTree.TSTypeReference): string | null {
    return type.typeName.type === AST_NODE_TYPES.Identifier ? type.typeName.name : null;
}

function isInsideTypeAliasDeclaration(node: TSESTree.Node): boolean {
    let current: TSESTree.Node | undefined = node.parent;
    while (current !== undefined && current.type !== AST_NODE_TYPES.Program) {
        if (current.type === AST_NODE_TYPES.TSTypeAliasDeclaration) return true;
        current = current.parent;
    }
    return false;
}

function isPlainAliasConsumerUse(node: TSESTree.TypeNode, environment: TypeEnvironment): boolean {
    if (node.type !== AST_NODE_TYPES.TSTypeReference || node.typeArguments?.params.length) return false;
    const name = typeReferenceName(node);
    return name !== null && environment.aliases.has(name) && !isInsideTypeAliasDeclaration(node);
}

function shouldReportType(node: TSESTree.TypeNode, environment: TypeEnvironment): boolean {
    if (isPlainAliasConsumerUse(node, environment)) return false;
    if (classifyUnsafeDictionary(node, environment) === null) return false;
    let current: TSESTree.Node | undefined = node.parent;
    while (current !== undefined && current.type !== AST_NODE_TYPES.Program) {
        if (isTypeNode(current) && classifyUnsafeDictionary(current, environment) !== null) {
            return false;
        }
        current = current.parent;
    }
    return true;
}

/** Disallow object-dictionary contracts whose direct value type is an unsafe escape hatch. */
export const noUnsafeDictionaryType = createRule({
    name: "no-unsafe-dictionary-type",
    meta: {
        type: "problem",
        docs: {
            description:
                "Disallow object-dictionary contracts whose direct value type is unknown, any, object, {}, or a union/alias containing one of those escape hatches."
        },
        messages: {
            unsafeDictionary:
                "This dictionary's {{value}} value type gives callers no concrete value contract. Use an owner/schema-derived value type; parse external payloads before insertion."
        },
        schema: []
    },
    defaultOptions: [],
    create(context) {
        let environment: TypeEnvironment | null = null;
        const report = (node: TSESTree.Node, value: string) => {
            context.report({ node, messageId: "unsafeDictionary", data: { value } });
        };
        const reportIfUnsafe = (node: TSESTree.TypeNode) => {
            if (environment === null || !shouldReportType(node, environment)) return;
            const unsafe = classifyUnsafeDictionary(node, environment);
            if (unsafe === null) return;
            report(node, unsafe.unsafeValue);
        };

        return {
            Program(node) {
                environment = createTypeEnvironment(node);
            },
            TSTypeReference: reportIfUnsafe,
            TSTypeLiteral: reportIfUnsafe,
            TSMappedType: reportIfUnsafe,
            TSIndexSignature(node) {
                if (
                    environment === null ||
                    node.typeAnnotation === undefined ||
                    node.parent.type === AST_NODE_TYPES.TSTypeLiteral
                ) {
                    return;
                }
                const unsafe = classifyUnsafeDictionaryValue(
                    node.typeAnnotation.typeAnnotation,
                    environment
                );
                if (unsafe !== null) report(node, unsafe.unsafeValue);
            }
        };
    }
});