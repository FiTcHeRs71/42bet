import { afterEach, describe, expect, test } from "vitest";

import { requireEnv } from "../src/lib/env";

const KEY = "TEST_REQUIRE_ENV_VAR";

afterEach(() => {
  delete process.env[KEY];
});

describe("requireEnv", () => {
  test("returns the value when the variable is set", () => {
    process.env[KEY] = "hello";
    expect(requireEnv(KEY)).toBe("hello");
  });

  test("throws when the variable is undefined", () => {
    delete process.env[KEY];
    expect(() => requireEnv(KEY)).toThrow();
  });

  test("throws when the variable is an empty string", () => {
    process.env[KEY] = "";
    expect(() => requireEnv(KEY)).toThrow();
  });

  test("error message names the missing variable", () => {
    delete process.env[KEY];
    expect(() => requireEnv(KEY)).toThrow(KEY);
  });
});
