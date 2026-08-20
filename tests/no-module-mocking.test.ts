import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "bun:test";

import { noModuleMocking } from "../src/rules/no-module-mocking.js";

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

const error = { messageId: "moduleMock" };

ruleTester.run("no-module-mocking", noModuleMocking, {
    valid: [
        "const store = new InMemoryUserStore();",
        "vi.spyOn(store, 'save');",
        "const vi = { mock() {} }; vi.mock();",
        "function test(jest: { mock(): void }) { jest.mock(); }",
        "import { vi as localVi } from './helpers'; localVi.mock('./module');"
    ],
    invalid: [
        { code: "vi.mock('./user-store');", errors: [error] },
        { code: "jest.mock('./user-store');", errors: [error] },
        { code: "vi['doMock']('./user-store');", errors: [error] },
        { code: "jest.unstable_mockModule('./user-store');", errors: [error] },
        { code: "import { vi } from 'vitest'; vi.mock('./user-store');", errors: [error] },
        { code: "import { vi as testApi } from 'vitest'; testApi.mock('./user-store');", errors: [error] },
        {
            code: "import { jest } from '@jest/globals'; jest.mock('./user-store');",
            errors: [error]
        }
    ]
});