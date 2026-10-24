# ADR-010: TOML Comment Preservation & Production Docker HTTP Deployment

## Status
Accepted

## Context
1. **TOML Comments Preservation & Display**:
   Users pasting TOML documents with extensive comments (e.g., Helmsman Desired State Files from `https://raw.githubusercontent.com/mkubaczyk/helmsman/refs/heads/master/examples/example.toml`, which contains 50 standalone comment lines and 24 inline annotations) noticed that comments were completely missing from the diff viewer.
   - Standard TOML parsers (including `smol-toml`) parse TOML into a JavaScript object, discarding comments entirely.
   - `computeSemanticDiff` previously traversed only `doc.data` keys, so 0 comment rows were emitted.
   - When users edited a value in Live Editor mode, standard serialization (`stringifyToml`) discarded comments from `rawText`.

2. **Production Docker Deployment**:
   The user required a production-grade container image using the latest software versions and OS (`node:22-alpine` and `nginx:1.27-alpine`), exposed on HTTP port 80 (since an upstream reverse proxy terminates SSL/HTTPS certificates), with SPA routing fallback, gzip compression, security headers, and health checks.

## Decision

### 1. Structured Comment Extraction (`parser.ts`)
We created `extractStructuredComments(rawText: string, format: DocumentFormat)` in `src/diff/parser.ts`:
- Scans `rawText` line-by-line, tracking the current section path (e.g., `$`, `$.metadata`, `$.certificates`, `$.apps.argo`).
- Captures standalone comments (`#`, `//`, `/* */`) as `CommentNode` objects with `id`, `text`, `cleanText`, `line`, `indent`, `sectionPath`, and `beforeKey`.
- For dotted TOML section headers (e.g., `[apps.argo.set]`), extracts `parentPath` (`$.apps.argo`) and `childKeyInParent` (`set`), accurately placing comments before sub-tables and array of tables.
- Trailing comments at the end of sections or at the end of documents are marked with `isTrailing: true`.
- Inline comments (`key = value # annotation`) are extracted into `inlineComments` keyed by both canonical path and key name.

### 2. Contextual Comment Alignment in Diff Engine (`semanticDiff.ts`)
- In `semanticDiff.ts`, `alignNodes` and `generateSingleSideRows` accept `CommentContext` containing `leftComments`, `rightComments`, `leftInline`, and `rightInline`.
- Before each child key in an object, matching comments are aligned side-by-side using `alignCommentNodes`:
  - Matching comments: `status: 'unchanged'`, rendered with `text-zinc-500 italic`.
  - Differing comments: `status: 'comment_diff'`, rendered with `text-sky-300/90 italic`.
  - Single-sided comments: `status: 'deleted_right'` or `'added_right'`.
- At the end of an object or section, trailing comments are emitted before the closing footer.
- Key-value rows preserve inline comments in `cell.comment` and append them to `cell.formattedText`. If values match but inline comments differ, the row is marked as `comment_diff`.
- In `computeSemanticDiff`, comment differences are tracked under `stats.commentDiff`, preserving accurate counts for data fields in `stats.addedRight` / `deletedRight`.

### 3. In-Place Text Patching Preserving Comments (`inPlacePatcher.ts`)
- Implemented `patchRawTextScalar(rawText, key, path, newValue, format)`: replaces scalar values directly in `rawText`, preserving all surrounding comments, empty lines, and original formatting.
- Implemented `patchRawTextCommentLine(rawText, lineNumber, newText)`: enables direct editing of comment rows in the Live Editor pane.

### 4. Multi-Stage Dockerfile & Nginx Configuration
- **Stage 1 (Builder)**: `node:22-alpine` executes `npm install` and `npm run build`, generating compiled SPA bundles in `/app/dist`.
- **Stage 2 (Runner)**: `nginx:1.27-alpine` listens on HTTP port 80.
  - SPA Fallback: `try_files $uri $uri/ /index.html;` ensures client-side routing.
  - Performance: Gzip compression enabled for text, json, yaml, toml, js, css, svg.
  - Security Headers: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
  - Caching: 1-year immutable caching for `/assets/*`, `no-cache` revalidation for `index.html`.
  - Healthcheck: `/healthz` endpoint returning `200 OK` with Docker container `HEALTHCHECK`.
- `.dockerignore`: Prevents `node_modules`, `dist`, `.git`, `.playwright-cli`, and `.env*` from polluting Docker build context.

## Consequences & Verification
- Helmsman's `example.toml` (141 lines, 50 comments, 24 inline comments) parses completely with all 50 comment lines visible in the diff viewer.
- Live Editor mode supports editing both data values and comment rows without comment loss.
- Full test suite has 20 passing unit tests (including tests for Helmsman TOML comment preservation and in-place patching).
- Production build succeeds cleanly via `npm run build`.
