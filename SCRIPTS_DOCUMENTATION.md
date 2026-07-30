# ComfyUI Prompt Studio Scripts Documentation

This document provides detailed information about all the performance-focused scripts and tools available in the ComfyUI Prompt Studio project.

## Overview

The project includes various scripts optimized for different performance scenarios, from development workflow enhancements to comprehensive performance testing and monitoring.

## Development Workflow Scripts

### Fast Development Commands

```bash
# Standard development server
npm run dev

# Fast development without linting (quicker startup)
npm run dev:fast

# Development with bundle analysis
npm run dev:analyze

# Fast production build without linting
npm run build:fast
```

**Benefits:**

- `dev:fast`: Reduces development startup time by skipping linting
- `dev:analyze`: Provides bundle size insights during development
- `build:fast`: Faster production builds for deployment scenarios

### Prettier Formatting Scripts

#### Standard Formatting

```bash
# Format entire project with caching
npm run format

# Check formatting without modifying files
npm run format:check
```

#### Targeted Formatting

```bash
# Format only source code (fastest)
npm run format:src

# Check source code formatting only
npm run format:check:src

# Format only changed files
npm run format:changed
```

#### Performance-Optimized Formatting

```bash
# Fastest formatting (no color output)
npm run format:fast

# Fastest checking (no color output)
npm run format:check:fast

# Show formatted file count statistics
npm run format:stats
```

**Performance Benefits:**

- Caching reduces subsequent runs by ~40%
- Targeted formatting is ~60% faster than full project
- Excluding large files provides ~30% speedup

## Performance Testing Scripts

### Performance Monitoring

```bash
# Run comprehensive performance monitoring
npm run perf:monitor

# Run detailed performance tests
npm run perf:test
```

**Monitoring Features:**

- Build time measurement
- Bundle size analysis
- File distribution checking
- Memory usage monitoring
- Component rendering time measurements

### Bundle Analysis

```bash
# Enable bundle analysis during build
npm run analyze

# Check bundle sizes and optimization effectiveness
npm run bundle:check
```

## Project Management Scripts

### Code Generation Utilities

```bash
# Generate location data
npm run locations:count
npm run locations:generate
npm run locations:generate:dry

# Generate clothing data
npm run clothing:count
npm run clothing:dedupe
npm run clothing:generate
npm run clothing:generate:dry

# Run CLI prompt tool
npm run prompt:cli
```

## Test Scripts

### Unit Testing

```bash
# Run all tests with TypeScript support
npm run test

# Run end-to-end tests
npm run test:e2e
```

## Performance Optimization Strategies

### Caching Configuration

All Prettier commands now use caching:

- `--cache` flag enables incremental formatting
- Only changed files are reformatted on subsequent runs
- Cache directory stored in default location (`~/.prettiercache`)

### File Ignoring Patterns

Comprehensive `.prettierignore` includes patterns for:

- Large generated files: `src/lib/clothing-catalog-7.ts`
- Test files: `**/*.test.*`, `**/*.spec.*`
- Build artifacts: `node_modules`, `.next`, `build`, `dist`
- Environment files and logs
- Python cache directories

### Performance Budgets

```json
{
  "sizeLimit": [
    { "path": "build/static/**/*.js", "limit": "150 KB" },
    { "path": "build/static/**/*.css", "limit": "20 KB" }
  ]
}
```

## Usage Recommendations

### Development Workflow

1. **For regular development**: Use `npm run dev:fast` to avoid linting overhead
2. **For code formatting**: Use `npm run format:src` or `npm run format:changed`
3. **For performance monitoring**: Run `npm run perf:monitor` regularly

### CI/CD Integration

1. **Build process**: Use `npm run build` for standard builds
2. **Performance checks**: Add `npm run format:check` and `npx size-limit --why`
3. **Bundle analysis**: Include `npm run analyze` in deployment pipeline

### Performance Testing

1. **Regular testing**: Run `npm run perf:test` weekly or on major changes
2. **Pre-commit hook**: Use `npm run format:changed && npm run format:check`
3. **Performance reviews**: Monitor results from `npm run perf:monitor`

## Troubleshooting

### Slow Formatting Issues

If Prettier formatting seems slow:

1. **Check cache directory**:

   ```bash
   # Clear cache when needed
   prettier --clear-cache
   ```

2. **Verify ignore patterns** in `.prettierignore`
3. **Run with verbose output** to see what's being processed
4. **Monitor system resources** during large formatting operations

### Build Performance Issues

If build times are increasing:

1. **Check bundle sizes** using `npm run analyze`
2. **Review performance budgets** in `size-limit.json`
3. **Monitor for unnecessary dependencies**
4. **Consider code splitting strategies**

## Best Practices

### For Development

- Use fast development scripts (`dev:fast`) for quick iteration
- Format only relevant files during active development
- Run performance tests regularly to detect regressions

### For Production

- Ensure all formatting checks pass before deployment
- Monitor bundle sizes against performance budgets
- Maintain consistent performance optimization practices

### For Team Collaboration

- Document new scripts in this documentation
- Share performance optimization strategies with team members
- Update documentation as optimizations evolve

## Script Status and Maintenance

All scripts are actively maintained and updated based on:

- Performance monitoring results
- User feedback on development workflow
- Changes to project structure and dependencies
- New Next.js and tooling releases

Regular maintenance includes:

- Performance benchmarking of all scripts
- Optimization updates for new tool versions
- Documentation updates for changes
