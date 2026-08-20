import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, ESLintUtils } from "@typescript-eslint/utils";

import { resolveVariable } from "./shared/resolve-variable.js";

const REGEX = /\s+/gu;

// eslint-disable-next-line new-cap
const createRule = ESLintUtils.RuleCreator(
    (name) => `https://example.com/rule/${name}`
);

type BroadTypeKind = "top" | "object" | "record";

interface KnownValueEvidence {
    readonly type: TSESTree.TypeNode | null;
}

const functionBoundaryTypes = new Set([
    AST_NODE_TYPES.ArrowFunctionExpression,
    AST_NODE_TYPES.FunctionDeclaration,
    AST_NODE_TYPES.FunctionExpression,
    AST_NODE_TYPES.TSDeclareFunction,
    AST_NODE_TYPES.TSEmptyBodyFunctionExpression
]);

function typeReferenceName(type: TSESTree.TSTypeReference): string | null {
    return type.typeName.type === AST_NODE_TYPES.Identifier ? type.typeName.name : null;
}

function isUnknownOrAnyType(type: TSESTree.TypeNode): boolean {
    return type.type === AST_NODE_TYPES.TSUnknownKeyword || type.type === AST_NODE_TYPES.TSAnyKeyword;
}

function isBroadRecordKeyType(type: TSESTree.TypeNode): boolean {
    if (
        type.type === AST_NODE_TYPES.TSStringKeyword ||
        type.type === AST_NODE_TYPES.TSNumberKeyword ||
        type.type === AST_NODE_TYPES.TSSymbolKeyword
    ) {
        return true;
    }
    if (type.type === AST_NODE_TYPES.TSUnionType) return type.types.every((member) => isBroadRecordKeyType(member));
    return type.type === AST_NODE_TYPES.TSTypeReference && typeReferenceName(type) === "PropertyKey";
}

function isBroadRecordType(type: TSESTree.TypeNode): boolean {
    if (type.type === AST_NODE_TYPES.TSTypeReference) {
        if (typeReferenceName(type) === "Readonly") {
            const [inner] = type.typeArguments?.params ?? [];
            return inner !== undefined && isBroadRecordType(inner);
        }

        if (typeReferenceName(type) !== "Record") return false;
        const parameters = type.typeArguments?.params ?? [];
        return (
            parameters.length === 2 &&
            parameters[0] !== undefined &&
            parameters[1] !== undefined &&
            isBroadRecordKeyType(parameters[0]) &&
            isUnknownOrAnyType(parameters[1])
        );
    }

    if (type.type !== AST_NODE_TYPES.TSTypeLiteral || type.members.length !== 1) return false;
    const [member] = type.members;
    if (member === undefined || member.type !== AST_NODE_TYPES.TSIndexSignature) return false;
    if (member.typeAnnotation === undefined) return false;
    const [parameter] = member.parameters;
    if (parameter === undefined) return false;
    if (parameter.type === AST_NODE_TYPES.TSParameterProperty) return false;
    if (parameter.typeAnnotation === undefined) return false;
    return (
        member.parameters.length === 1 &&
        isBroadRecordKeyType(parameter.typeAnnotation.typeAnnotation) &&
        isUnknownOrAnyType(member.typeAnnotation.typeAnnotation)
    );
}

function broadTypeKind(type: TSESTree.TypeNode): BroadTypeKind | null {
    if (type.type === AST_NODE_TYPES.TSUnknownKeyword || type.type === AST_NODE_TYPES.TSAnyKeyword) return "top";
    if (type.type === AST_NODE_TYPES.TSObjectKeyword) return "object";
    return isBroadRecordType(type) ? "record" : null;
}

function assertedExpression(
    node: TSESTree.TSAsExpression | TSESTree.TSTypeAssertion
): TSESTree.Expression {
    return node.expression;
}

function assertionFromExpression(
    expression: TSESTree.Expression
): TSESTree.TSAsExpression | TSESTree.TSTypeAssertion | null {
    return expression.type === AST_NODE_TYPES.TSAsExpression ||
        expression.type === AST_NODE_TYPES.TSTypeAssertion
        ? expression
        : null;
}

function normalizedTypeText(sourceText: string, type: TSESTree.TypeNode): string {
    return sourceText.slice(type.range[0], type.range[1]).replaceAll(REGEX, "");
}

function typesHaveSameSyntax(
    sourceText: string,
    left: TSESTree.TypeNode | null,
    right: TSESTree.TypeNode
): boolean {
    return left !== null && normalizedTypeText(sourceText, left) === normalizedTypeText(sourceText, right);
}

function isDefinitelyObjectType(type: TSESTree.TypeNode): boolean {
    switch (type.type) {
        case AST_NODE_TYPES.TSArrayType:
        case AST_NODE_TYPES.TSConstructorType:
        case AST_NODE_TYPES.TSFunctionType:
        case AST_NODE_TYPES.TSMappedType:
        case AST_NODE_TYPES.TSObjectKeyword:
        case AST_NODE_TYPES.TSTupleType:
            return true;
        case AST_NODE_TYPES.TSTypeLiteral:
            return type.members.length > 0;
        case AST_NODE_TYPES.TSIntersectionType:
            return type.types.every((member) => isDefinitelyObjectType(member));
        case AST_NODE_TYPES.TSTypeOperator:
            return (
                type.operator === "readonly" &&
                type.typeAnnotation !== undefined &&
                isDefinitelyObjectType(type.typeAnnotation)
            );
        default:
            return false;
    }
}

function isDefinitelyNarrowerRecordType(type: TSESTree.TypeNode): boolean {
    if (type.type === AST_NODE_TYPES.TSTypeLiteral) {
        return type.members.some((member) => member.type !== AST_NODE_TYPES.TSIndexSignature);
    }

    if (type.type !== AST_NODE_TYPES.TSTypeReference) return false;
    if (typeReferenceName(type) === "Readonly") {
        const [inner] = type.typeArguments?.params ?? [];
        return inner !== undefined && isDefinitelyNarrowerRecordType(inner);
    }
    if (typeReferenceName(type) !== "Record") return false;

    const parameters = type.typeArguments?.params ?? [];
    return (
        parameters.length === 2 && parameters[1] !== undefined && !isUnknownOrAnyType(parameters[1])
    );
}

function functionBoundary(node: TSESTree.Node): TSESTree.Node | null {
    let current: TSESTree.Node | undefined = node.parent;
    while (current !== undefined && current.type !== AST_NODE_TYPES.Program) {
        if (functionBoundaryTypes.has(current.type)) return current;
        current = current.parent;
    }
    return null;
}

function variableDeclarator(variable: TSESLint.Scope.Variable): TSESTree.VariableDeclarator | null {
    for (const definition of variable.defs) {
        if (definition.type === "Variable" && definition.node.type === AST_NODE_TYPES.VariableDeclarator) {
            return definition.node;
        }
    }
    return null;
}

function knownValueEvidence(
    expression: TSESTree.Expression,
    sourceCode: Readonly<TSESLint.SourceCode>,
    boundary: TSESTree.Node | null,
    visitedVariables: ReadonlySet<TSESLint.Scope.Variable>
): KnownValueEvidence | null {
    const unwrapped = expression;

    if (unwrapped.type === AST_NODE_TYPES.TSAsExpression || unwrapped.type === AST_NODE_TYPES.TSTypeAssertion) {
        if (broadTypeKind(unwrapped.typeAnnotation) !== null) return null;
        return { type: unwrapped.typeAnnotation };
    }

    if (unwrapped.type === AST_NODE_TYPES.Literal || unwrapped.type === AST_NODE_TYPES.TemplateLiteral) {
        return { type: null };
    }

    if (
        unwrapped.type === AST_NODE_TYPES.ArrayExpression ||
        unwrapped.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        unwrapped.type === AST_NODE_TYPES.ClassExpression ||
        unwrapped.type === AST_NODE_TYPES.FunctionExpression ||
        unwrapped.type === AST_NODE_TYPES.NewExpression ||
        unwrapped.type === AST_NODE_TYPES.ObjectExpression
    ) {
        return { type: null };
    }

    if (unwrapped.type !== AST_NODE_TYPES.Identifier) return null;
    const variable = resolveVariable(sourceCode, unwrapped);
    if (variable === null || visitedVariables.has(variable)) return null;

    const annotatedIdentifier = variable.identifiers.find(
        (identifier) => identifier.typeAnnotation !== undefined
    );
    const annotation = annotatedIdentifier?.typeAnnotation?.typeAnnotation;
    if (annotation !== undefined && annotatedIdentifier !== undefined) {
        if (functionBoundary(annotatedIdentifier) !== boundary || broadTypeKind(annotation) !== null) {
            return null;
        }
        return { type: annotation };
    }

    const declarator = variableDeclarator(variable);
    if (
        declarator === null ||
        declarator.parent.type !== AST_NODE_TYPES.VariableDeclaration ||
        declarator.parent.kind !== "const" ||
        declarator.init === null ||
        variable.references.some((reference) => reference.isWrite() && !reference.init) ||
        functionBoundary(declarator) !== boundary
    ) {
        return null;
    }

    return knownValueEvidence(
        declarator.init,
        sourceCode,
        boundary,
        new Set([...visitedVariables, variable])
    );
}

function widenedBinding(
    variable: TSESLint.Scope.Variable,
    sourceCode: Readonly<TSESLint.SourceCode>
): {
    readonly broadKind: BroadTypeKind;
    readonly evidence: KnownValueEvidence;
    readonly declaredAt: number;
    readonly boundary: TSESTree.Node | null;
} | null {
    const declarator = variableDeclarator(variable);
    if (
        declarator === null ||
        declarator.parent.type !== AST_NODE_TYPES.VariableDeclaration ||
        declarator.parent.kind !== "const" ||
        declarator.id.type !== AST_NODE_TYPES.Identifier ||
        declarator.init === null ||
        variable.references.some((reference) => reference.isWrite() && !reference.init)
    ) {
        return null;
    }

    const boundary = functionBoundary(declarator);
    const declaredType = declarator.id.typeAnnotation?.typeAnnotation;
    const initializerAssertion = assertionFromExpression(declarator.init);
    const initializerBroadKind =
        initializerAssertion === null ? null : broadTypeKind(initializerAssertion.typeAnnotation);
    const declaredBroadKind = declaredType === undefined ? null : broadTypeKind(declaredType);
    const broadKind = declaredBroadKind ?? initializerBroadKind;
    if (broadKind === null) return null;

    const originalExpression =
        initializerAssertion !== null && initializerBroadKind !== null
            ? assertedExpression(initializerAssertion)
            : declarator.init;
    const evidence = knownValueEvidence(originalExpression, sourceCode, boundary, new Set([variable]));
    return evidence === null ? null : { broadKind, evidence, declaredAt: declarator.range[1], boundary };
}

function assertionIsNarrower(
    sourceText: string,
    broadKind: BroadTypeKind,
    evidence: KnownValueEvidence,
    assertedType: TSESTree.TypeNode
): boolean {
    if (broadTypeKind(assertedType) !== null) return false;
    if (broadKind === "top") return true;
    if (typesHaveSameSyntax(sourceText, evidence.type, assertedType)) return true;
    if (broadKind === "object") return isDefinitelyObjectType(assertedType);
    return isDefinitelyNarrowerRecordType(assertedType);
}

/** Detect immutable local bindings that erase a known type and are later asserted back to a narrower type. */
export const noWidenThenAssert = createRule({
    name: "no-widen-then-assert",
    meta: {
        type: "problem",
        docs: {
            description:
                "Disallow local const flows that explicitly widen a known value before asserting the widened binding to a narrower type."
        },
        messages: {
            widenThenAssert:
                "Binding \"{{name}}\" discards type evidence and later recreates it with an assertion. Keep the precise type from initialization through use; parse boundary input once."
        },
        schema: []
    },
    defaultOptions: [],
    create(context) {
        const checkAssertion = (node: TSESTree.TSAsExpression | TSESTree.TSTypeAssertion) => {
            const expression = assertedExpression(node);
            if (expression.type !== AST_NODE_TYPES.Identifier) return;

            const variable = resolveVariable(context.sourceCode, expression);
            if (variable === null) return;
            const widened = widenedBinding(variable, context.sourceCode);
            if (
                widened === null ||
                node.range[0] <= widened.declaredAt ||
                functionBoundary(node) !== widened.boundary ||
                !assertionIsNarrower(
                    context.sourceCode.text,
                    widened.broadKind,
                    widened.evidence,
                    node.typeAnnotation
                )
            ) {
                return;
            }

            context.report({
                node,
                messageId: "widenThenAssert",
                data: { name: expression.name }
            });
        };

        return {
            TSAsExpression: checkAssertion,
            TSTypeAssertion: checkAssertion
        };
    }
});