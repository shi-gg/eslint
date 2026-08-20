import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "bun:test";

import { noUnknownTypeAliases } from "../src/rules/no-unknown-type-aliases.js";

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

const error = { messageId: "unknownAlias" };

ruleTester.run("no-unknown-type-aliases", noUnknownTypeAliases, {
    valid: [
        "type User = { readonly id: string };",
        "type Alias = string; type UserId = Alias;"
    ],
    invalid: [
        { code: "type Alias = unknown;", errors: [error] },
        { code: "type Current = unknown;", errors: [error] },
        { code: "type UnknownValue = unknown; type Alias = UnknownValue;", errors: [error, error] }
    ]
});