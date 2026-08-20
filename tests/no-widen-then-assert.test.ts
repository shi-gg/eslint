import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "bun:test";

import { noWidenThenAssert } from "../src/rules/no-widen-then-assert.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.afterAll = afterAll;

const ruleTester = new RuleTester({
    languageOptions: {
        parserOptions: {
            projectService: {
                allowDefaultProject: ["*.ts*"],
                defaultProject: "tsconfig.json"
            },
            tsconfigRootDir: process.cwd()
        }
    }
});

const error = { messageId: "widenThenAssert" };

ruleTester.run("no-widen-then-assert", noWidenThenAssert, {
    valid: [
        "const source = { id: 'first' }; const widened: unknown = source;",
        "declare const input: unknown; const parsed = input as { readonly id: string };"
    ],
    invalid: [
        {
            code: "const source = { id: 'second' }; const widened: unknown = source; const parsed = widened as { readonly id: string };",
            errors: [error]
        }
    ]
});