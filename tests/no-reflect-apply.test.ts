import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "bun:test";

import { noReflectApply } from "../src/rules/no-reflect-apply.js";

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

const error = { messageId: "reflectApply" };

ruleTester.run("no-reflect-apply", noReflectApply, {
    valid: [
        "const value = operation.apply(owner, args);",
        "Reflect.get(owner, key);",
        "const Reflect = { apply() { return 1; } }; Reflect.apply();",
        "function invoke(Reflect: { apply(): number }) { return Reflect.apply(); }"
    ],
    invalid: [
        { code: "const value = Reflect.apply(operation, owner, args);", errors: [error] },
        { code: "const value = Reflect['apply'](operation, owner, args);", errors: [error] }
    ]
});