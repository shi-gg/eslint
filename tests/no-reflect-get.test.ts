import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "bun:test";

import { noReflectGet } from "../src/rules/no-reflect-get.js";

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

const error = { messageId: "reflectGet" };

ruleTester.run("no-reflect-get", noReflectGet, {
    valid: [
        "const value = owner.property;",
        "const value = owner[key];",
        "Reflect.set(owner, key, value);",
        "const Reflect = { get() { return 1; } }; Reflect.get();",
        "function read(Reflect: { get(): number }) { return Reflect.get(); }"
    ],
    invalid: [
        { name: "static access", code: "const value = Reflect.get(owner, key);", errors: [error] },
        { name: "computed access", code: "const value = Reflect['get'](owner, key);", errors: [error] }
    ]
});