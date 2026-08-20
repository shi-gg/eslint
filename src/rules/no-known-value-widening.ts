import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES, ESLintUtils } from "@typescript-eslint/utils";

import {
    classifyWideningTarget,
    createTypeEnvironment,
    isKnownEvidenceExpression,
    type TypeEnvironment,
    type WideningTarget
} from "./shared/dictionary-types.js";
import { resolveVariable } from "./shared/resolve-variable.js";

// eslint-disable-next-line new-cap
const createRule = ESLintUtils.RuleCreator(
    (name) => `https://example.com/rule/${name}`
);

type FunctionExpression = TSESTree.ArrowFunctionExpression | TSESTree.FunctionDeclaration | TSESTree.FunctionExpression;

function unwrapExpression(expression: TSESTree.Expression): TSESTree.Expression {
    let current = expression;
    while (
        current.type === AST_NODE_TYPES.TSAsExpression ||
        current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
        current.type === AST_NODE_TYPES.TSTypeAssertion ||
        current.type === AST_NODE_TYPES.TSNonNullExpression
    ) {
        current = current.expression;
    }
    return current;
}

function variableDeclarator(variable: TSESLint.Scope.Variable): TSESTree.VariableDeclarator | null {
    if (variable.defs.length !== 1) return null;
    const [definition] = variable.defs;
    return definition?.type === "Variable" && definition.node.type === AST_NODE_TYPES.VariableDeclarator
        ? definition.node
        : null;
}

function isStableConstVariable(variable: TSESLint.Scope.Variable, declarator: TSESTree.VariableDeclarator): boolean {
    return (
        declarator.parent.type === AST_NODE_TYPES.VariableDeclaration &&
        declarator.parent.kind === "const" &&
        variable.references.every((reference) => reference.init || !reference.isWrite())
    );
}

function hasKnownEvidence(
    sourceCode: Readonly<TSESLint.SourceCode>,
    expression: TSESTree.Expression,
    visitedVariables = new Set<TSESLint.Scope.Variable>()
): boolean {
    if (isKnownEvidenceExpression(expression)) return true;
    const unwrapped = unwrapExpression(expression);
    if (unwrapped.type !== AST_NODE_TYPES.Identifier) return false;
    const variable = resolveVariable(sourceCode, unwrapped);
    if (variable === null || visitedVariables.has(variable)) return false;
    const declarator = variableDeclarator(variable);
    if (
        declarator === null ||
        declarator.init === null ||
        !isStableConstVariable(variable, declarator)
    ) {
        return false;
    }
    visitedVariables.add(variable);
    return hasKnownEvidence(sourceCode, declarator.init, visitedVariables);
}

function annotationTarget(
    annotation: TSESTree.TSTypeAnnotation | undefined,
    environment: TypeEnvironment
): WideningTarget | null {
    return annotation === undefined
        ? null
        : classifyWideningTarget(annotation.typeAnnotation, environment);
}

function enclosingFunction(node: TSESTree.Node): FunctionExpression | null {
    let current: TSESTree.Node | undefined = node.parent;
    while (current !== undefined && current.type !== AST_NODE_TYPES.Program) {
        if (
            current.type === AST_NODE_TYPES.ArrowFunctionExpression ||
            current.type === AST_NODE_TYPES.FunctionDeclaration ||
            current.type === AST_NODE_TYPES.FunctionExpression
        ) {
            return current;
        }
        current = current.parent;
    }
    return null;
}

function sourceKeyName(sourceCode: Readonly<TSESLint.SourceCode>, key: TSESTree.PropertyName): string {
    if (key.type === AST_NODE_TYPES.Identifier || key.type === AST_NODE_TYPES.PrivateIdentifier) return key.name;
    if (key.type === AST_NODE_TYPES.Literal) return String(key.value);
    return sourceCode.getText(key);
}

function functionName(sourceCode: Readonly<TSESLint.SourceCode>, owner: FunctionExpression | null): string {
    if (owner === null) return "anonymous function";
    if (owner.id !== null) return owner.id.name;
    const { parent } = owner;
    if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id.type === AST_NODE_TYPES.Identifier) {
        return parent.id.name;
    }
    if (parent.type === AST_NODE_TYPES.MethodDefinition) return sourceKeyName(sourceCode, parent.key);
    return "anonymous function";
}

function isEmptyObjectExpression(expression: TSESTree.Expression): boolean {
    const unwrapped = unwrapExpression(expression);
    return unwrapped.type === AST_NODE_TYPES.ObjectExpression && unwrapped.properties.length === 0;
}

function isDictionaryAccumulatorTarget(destination: WideningTarget): boolean {
    return destination.kind === "open dictionary" || destination.kind === "generic container";
}

function hasParentAssertion(node: TSESTree.Node): boolean {
    return (
        node.parent?.type === AST_NODE_TYPES.TSAsExpression ||
        node.parent?.type === AST_NODE_TYPES.TSTypeAssertion
    );
}

/** Detect sound syntactic cases where a known value is explicitly widened and loses evidence. */
export const noKnownValueWidening = createRule({
    name: "no-known-value-widening",
    meta: {
        type: "problem",
        docs: {
            description:
                "Disallow syntactically established values from flowing into explicitly broad or anonymous target types that discard useful evidence."
        },
        messages: {
            widening:
                "The explicit {{target}} type on {{subject}} discards known type evidence. Keep inference, validate with `satisfies`, or use a named owner contract."
        },
        schema: []
    },
    defaultOptions: [],
    create(context) {
        let environment: TypeEnvironment | null = null;

        const reportFlow = (
            expression: TSESTree.Expression,
            destination: WideningTarget | null,
            subject: string
        ) => {
            if (destination === null) return;
            if (
                isDictionaryAccumulatorTarget(destination) &&
                isEmptyObjectExpression(expression)
            ) {
                return;
            }
            if (!hasKnownEvidence(context.sourceCode, expression)) return;
            context.report({
                node: expression,
                messageId: "widening",
                data: { subject, target: destination.kind }
            });
        };

        const targetFromAnnotation = (annotation: TSESTree.TSTypeAnnotation | undefined) =>
            environment === null ? null : annotationTarget(annotation, environment);

        return {
            Program(node) {
                environment = createTypeEnvironment(node);
            },
            VariableDeclarator(node) {
                if (node.init === null || node.id.type !== AST_NODE_TYPES.Identifier) return;
                reportFlow(
                    node.init,
                    targetFromAnnotation(node.id.typeAnnotation),
                    `binding \`${node.id.name}\``
                );
            },
            PropertyDefinition(node) {
                if (node.value === null) return;
                reportFlow(
                    node.value,
                    targetFromAnnotation(node.typeAnnotation),
                    `property \`${sourceKeyName(context.sourceCode, node.key)}\``
                );
            },
            AccessorProperty(node) {
                if (node.value === null) return;
                reportFlow(
                    node.value,
                    targetFromAnnotation(node.typeAnnotation),
                    `property \`${sourceKeyName(context.sourceCode, node.key)}\``
                );
            },
            AssignmentExpression(node) {
                if (node.operator !== "=" || node.left.type !== AST_NODE_TYPES.Identifier) return;
                const variable = resolveVariable(context.sourceCode, node.left);
                if (variable === null) return;
                const declarator = variableDeclarator(variable);
                if (declarator === null || declarator.id.type !== AST_NODE_TYPES.Identifier) return;
                reportFlow(
                    node.right,
                    targetFromAnnotation(declarator.id.typeAnnotation),
                    `binding \`${declarator.id.name}\``
                );
            },
            ReturnStatement(node) {
                if (node.argument === null) return;
                const owner = enclosingFunction(node);
                reportFlow(
                    node.argument,
                    targetFromAnnotation(owner?.returnType),
                    `return value of \`${functionName(context.sourceCode, owner)}\``
                );
            },
            ArrowFunctionExpression(node) {
                if (node.body.type === AST_NODE_TYPES.BlockStatement) return;
                reportFlow(
                    node.body,
                    targetFromAnnotation(node.returnType),
                    `return value of \`${functionName(context.sourceCode, node)}\``
                );
            },
            TSAsExpression(node) {
                if (environment === null || hasParentAssertion(node)) return;
                reportFlow(
                    node.expression,
                    classifyWideningTarget(node.typeAnnotation, environment),
                    "assertion"
                );
            },
            TSTypeAssertion(node) {
                if (environment === null || hasParentAssertion(node)) return;
                reportFlow(
                    node.expression,
                    classifyWideningTarget(node.typeAnnotation, environment),
                    "assertion"
                );
            }
        };
    }
});