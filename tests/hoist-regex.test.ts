import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "bun:test";

import { hoistRegex } from "../src/rules/hoist-regex.js";

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

ruleTester.run("hoist-regex", hoistRegex, {
    valid: [
        "const REGEX = /ab/g;",
        `
    const REGEX = /ab/g;
    function foo() {
      return REGEX.test('ab');
    }
    `,
        "export const EXPORTED_REGEX = /foo/;"
    ],
    invalid: [
        {
            code: `
      function foo() {
        return /ab/g.test('ab');
      }
      `,
            output: `
const REGEX = /ab/g;
      function foo() {
        return REGEX.test('ab');
      }
      `,
            errors: [{ messageId: "hoistRegex" }]
        },
        {
            code: `
        const REGEX = 'something else';
        function foo() {
            return /ab/g.test('ab');
        }
        `,
            output: `
const REGEX_1 = /ab/g;
        const REGEX = 'something else';
        function foo() {
            return REGEX_1.test('ab');
        }
        `,
            errors: [{ messageId: "hoistRegex" }]
        }
    ]
});