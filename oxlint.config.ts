import { defineConfig } from "oxlint";

export default defineConfig({
  categories: {
    correctness: "error",
    pedantic: "error",
    perf: "error",
    style: "error",
    suspicious: "error",
  },
  options: {
    typeAware: true,
  },
  rules: {
    // Sometimes, words do not need a capital letter.
    "capitalized-comments": "off",
    // Sometimes, we want to put a statement on the same line as an "if", but
    // we don't always want single statements without braces.
    curly: "off",
    // The most appropriate function style depends on context.
    "eslint/func-style": "off",
    // Sometimes, we want short variable names.
    "id-length": "off",
    // Difficult to set a hard rule for this.
    "max-classes-per-file": "off",
    "max-lines-per-function": "off",
    "max-params": "off",
    "max-statements": "off",
    // Obviously, we want to be able to use "continue".
    "no-continue": "off",
    // Magic numbers are sometimes the clearest option.
    "no-magic-numbers": "off",
    // Inconvenient for application classes.
    "no-new": "off",
    // Obviously, we want to be able to use ternary statements.
    "no-ternary": "off",
    // This is too inconvenient when casting HTML element types.
    "no-unsafe-type-assertion": "off",
    // This rule conflicts with default oxfmt sorting behaviour.
    "sort-imports": "off",
    // null is semantically different from undefined for me.
    "unicorn/no-null": "off",
  },
});
