import { defineConfig } from "oxlint";

export default defineConfig({
  categories: {
    correctness: "error",
    suspicious: "error",
    pedantic: "error",
    perf: "error",
  },
  options: {
    typeAware: true,
  },
  rules: {
    // Difficult to set a hard rule for this.
    "max-classes-per-file": "off",
    "max-lines-per-function": "off",
    // Inconvenient for application classes.
    "no-new": "off",
    // This is too inconvenient when casting HTML element types.
    "no-unsafe-type-assertion": "off",
  },
});
