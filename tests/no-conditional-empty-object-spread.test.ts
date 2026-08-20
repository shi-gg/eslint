import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "bun:test";

import { noConditionalEmptyObjectSpread } from "../src/rules/no-conditional-empty-object-spread.js";

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

ruleTester.run("no-conditional-empty-object-spread", noConditionalEmptyObjectSpread, {
    valid: [
        "const result = { value };",
        "const result = { ...values };",
        "const result = condition ? { value } : {};"
    ],
    invalid: [
        {
            code: "const result = { ...(value !== undefined ? { value } : {}) };",
            errors: [{ messageId: "avoid" }]
        },
        {
            code: "const result = { ...(condition ? {} : { value }) };",
            errors: [{ messageId: "avoid" }]
        }
    ]
});