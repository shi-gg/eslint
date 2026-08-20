import { ESLintUtils } from "@typescript-eslint/utils";

import { isGlobalReflectMethodCall } from "./shared/reflect-method.js";

// eslint-disable-next-line new-cap
const createRule = ESLintUtils.RuleCreator(
    (name) => `https://example.com/rule/${name}`
);

/** Ban Reflect.apply, which bypasses ordinary typed function calls. */
export const noReflectApply = createRule({
    name: "no-reflect-apply",
    meta: {
        type: "problem",
        docs: {
            description:
                "Disallow Reflect.apply; call typed functions directly or model dynamic dispatch behind an interface."
        },
        messages: {
            reflectApply:
                "Replace `Reflect.apply` with a typed function call. Model dynamic dispatch behind a named interface."
        },
        schema: []
    },
    defaultOptions: [],
    create(context) {
        return {
            CallExpression(node) {
                if (node.callee.type === "Super") return;
                if (isGlobalReflectMethodCall(context.sourceCode, node.callee, "apply")) {
                    context.report({ node, messageId: "reflectApply" });
                }
            }
        };
    }
});