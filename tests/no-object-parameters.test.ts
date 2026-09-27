import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "bun:test";

import { noObjectParameters } from "../src/rules/no-object-parameters.js";

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

const error = { messageId: "objectParameter" };

ruleTester.run("no-object-parameters", noObjectParameters, {
    valid: [
        "type Alias = object;",
        "function f(value: Alias) {}",
        "interface Owner { readonly id: string } function f(value: Owner) {}",
        "function f<Value>(value: Value) {}",
        "function f<Value extends object>(value: Value) {}",
        "function f<Value extends Owner, Owner extends { readonly id: string }>(value: Value) {}",
        "type Owner = { readonly id: string }; function f<Value extends Owner>(value: Value) {}",
        "type Alias = object; function consume<Alias>(value: Alias) {}",
        "type Alias = object; type Consumer<Alias> = (value: Alias) => void;",
        "type Alias = object; interface Consumer<Alias> { consume(value: Alias): void }",
        "type Key = object; type Mapped<Input> = { [Key in keyof Input]: (value: Key) => void };",
        "type Item = object; type Unpacked<Input> = Input extends Promise<infer Item> ? (value: Item) => void : never;"
    ],
    invalid: [
        { code: "function f(value: object) {}", errors: [error] },
        { code: "type Alias = object; function f(value: Alias) {}", errors: [error] },
        {
            code: "type Item = object; type Fallback<Input> = Input extends infer Item ? string : (value: Item) => void;",
            errors: [error]
        }
    ]
});