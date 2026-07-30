module.exports = {
  semi: true,
  singleQuote: true,
  trailingComma: "es5",
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  bracketSpacing: true,
  arrowParens: "avoid",
  endOfLine: "lf",
  overrides: [
    {
      files: "*.ts",
      options: {
        parser: "typescript"
      }
    },
    {
      files: "*.tsx",
      options: {
        parser: "typescript"
      }
    }
  ],
  singleAttributePerLine: false,
  bracketSameLine: false,
  // Performance optimizations
  cache: true,
  cacheStrategy: "content",
  // Avoid unnecessary operations for large files
  printWidth: 120,
};