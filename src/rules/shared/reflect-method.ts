import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";

import { resolveVariable } from "./resolve-variable.js";

function isGlobalReflect(sourceCode: Readonly<TSESLint.SourceCode>, expression: TSESTree.Expression): boolean {
    if (expression.type !== AST_NODE_TYPES.Identifier || expression.name !== "Reflect") return false;
    const variable = resolveVariable(sourceCode, expression);
    return variable === null || variable.defs.length === 0;
}

/** Reports whether a call target names one method on the global Reflect object. */
export function isGlobalReflectMethodCall(
    sourceCode: Readonly<TSESLint.SourceCode>,
    callee: TSESTree.Expression,
    methodName: string
): boolean {
    if (callee.type !== AST_NODE_TYPES.MemberExpression) return false;
    if (!isGlobalReflect(sourceCode, callee.object)) return false;
    const { property } = callee;
    return callee.computed
        ? property.type === AST_NODE_TYPES.Literal && property.value === methodName
        : property.type === AST_NODE_TYPES.Identifier && property.name === methodName;
}