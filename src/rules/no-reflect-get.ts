import { ESLintUtils } from "@typescript-eslint/utils";

import { isGlobalReflectMethodCall } from "./shared/reflect-method.js";

// eslint-disable-next-line new-cap
const createRule = ESLintUtils.RuleCreator(
    (name) => `https://example.com/rule/${name}`
);

/** Ban Reflect.get, which bypasses ordinary property access and useful type evidence. */
export const noReflectGet = createRule({
    name: "no-reflect-get",
    meta: {
        type: "problem",
        docs: {
            description:
                "Disallow Reflect.get; use typed property access or parse dynamic input into a domain type."
        },
        messages: {
            reflectGet:
                "Replace `Reflect.get` with typed property access. Parse dynamic input into a named domain type before reading it."
        },
        schema: []
    },
    defaultOptions: [],
    create(context) {
        return {
            CallExpression(node) {
                if (node.callee.type === "Super") return;
                if (isGlobalReflectMethodCall(context.sourceCode, node.callee, "get")) {
                    context.report({ node, messageId: "reflectGet" });
                }
            }
        };
    }
});