import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "bun:test";

import { noChainedTypeAssertions } from "../src/rules/no-chained-type-assertions.js";

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

ruleTester.run("no-chained-type-assertions", noChainedTypeAssertions, {
    valid: [
        "const x = value as string;",
        "const x = <string>value;",
        "const x = value as const;",
        "const x = value as const as const;"
    ],
    invalid: [
        {
            code: "const x = value as string as number;",
            errors: [{ messageId: "chained" }]
        },
        {
            code: "const x = <number><string>value;",
            errors: [{ messageId: "chained" }]
        },
        {
            code: "const x = value as const as number;",
            errors: [{ messageId: "chained" }]
        }
    ]
});