import type { TSESLint, TSESTree } from "@typescript-eslint/utils";

export function resolveVariable(
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