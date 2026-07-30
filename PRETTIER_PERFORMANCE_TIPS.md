# Prettier Performance Optimization Guide

This document outlines best practices and optimizations for making Prettier run faster in this large codebase.

## Key Optimizations Implemented

1. **Caching**: All formatting commands now use `--cache` flag for incremental formatting
2. **Selective Formatting**: Targeted scripts that format only specific file types or directories
3. **Efficient Ignoring**: Comprehensive `.prettierignore` with patterns for large directories and files
4. **Configuration Optimizations**: Prettier settings tuned for performance

## Recommended Usage Patterns

### For Development Work
```bash
# Format only source code (fastest)
npm run format:src

# Check formatting only in source code
npm run format:check:src

# Format only changed files
npm run format:changed
```

### For Full Project Formatting
```bash
# Full formatting with cache
npm run format

# Check full formatting without modifying
npm run format:check
```

### Performance Options
```bash
# Fastest formatting (no color output)
npm run format:fast

# Fastest checking (no color output)  
npm run format:check:fast
```

## Additional Performance Tips

1. **Use Incremental Formatting**: The `--cache` flag ensures only changed files are reformatted
2. **Target Specific Directories**: Use `format:src` instead of formatting the entire project
3. **Avoid Large File Processing**: Excluded large generated files like clothing-catalog-7.ts
4. **Leverage Parallelization**: Prettier can process multiple files in parallel when run on specific directories

## Monitoring Performance

Use the stats script to see how many files are being formatted:
```bash
npm run format:stats
```

This should help identify if there are any unexpected files being processed.

## Troubleshooting

If formatting seems slow:

1. Check cache directory: `~/.prettiercache` or `.prettiercache`
2. Verify ignore patterns in `.prettierignore` 
3. Run with verbose output to see what's being processed
4. Consider adding more specific ignore patterns for project-specific large files

## Configuration Notes

- The `.prettierrc.cjs` file uses `cacheStrategy: "content"` for better cache performance
- `printWidth: 120` helps reduce unnecessary line wrapping in some cases
- Disabled color output (`--no-color`) for faster processing in CI environments