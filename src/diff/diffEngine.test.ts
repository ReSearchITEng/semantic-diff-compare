/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { extractAndStripComments, repairJsonc } from './jsoncRepair';
import { convertTabsToSpaces, lintYamlTabs } from './yamlLinter';
import { areValuesEqual, computeSemanticDiff, isFieldIgnored } from './semanticDiff';
import {
  getValueAtPath,
  setValueAtPath,
  mergeDataTrees,
  serializePreservingFormat,
  parseInlineValue,
  computeIntraLineDiff,
  parseEditedLine,
  renameKeyAtPath,
} from './inPlacePatcher';
import { detectFormat, parseDocument, validatePastedDocument } from './parser';
import { convertDocumentToFormat } from './formatter';
import { generateDiffReport } from './diffReport';

test('JSONC: comments stripping preserves structure and extracts comments', () => {
  const jsonc = `{\n  // single line comment\n  "key": "value", /* inline comment */\n  "num": 42\n}`;
  const { cleanJson, comments } = extractAndStripComments(jsonc);
  assert.equal(comments.length, 2);
  const parsed = JSON.parse(cleanJson);
  assert.equal(parsed.key, 'value');
  assert.equal(parsed.num, 42);
});

test('Auto-repair: fixes unclosed string quotes, missing brackets, and dangling commas', () => {
  const broken = `{\n  "service": "auth-service",\n  "tags": ["v1", "prod"],\n  "active": true,\n  "msg": "incomplete msg`;
  const result = repairJsonc(broken);

  assert.equal(result.repairInfo.wasRepaired, true);
  assert.ok(result.repairInfo.repairsMade.length >= 2);
  assert.ok(result.repairInfo.breakpointLine !== undefined);
  assert.equal(result.parsedData.service, 'auth-service');
  assert.equal(result.parsedData.active, true);
  assert.equal(result.parsedData.msg, 'incomplete msg');

  // Deeply nested truncated JSON test
  const nestedBroken = `{\n  "status": "healthy",\n  "cluster": {\n    "nodes": [\n      { "id": "node-1" },\n      { "id": "node-2", "reason": "disk-pressure\n`;
  const nestedResult = repairJsonc(nestedBroken);
  assert.equal(nestedResult.repairInfo.wasRepaired, true);
  assert.equal(nestedResult.parsedData.status, 'healthy');
  assert.equal(nestedResult.parsedData.cluster.nodes[1].reason, 'disk-pressure');
});

test('YAML Linter: detects illegal tabs and converts to 2 spaces', () => {
  const yamlWithTabs = 'spec:\n\treplicas: 3\n\tcontainers:\n\t\t- name: web';
  const issues = lintYamlTabs(yamlWithTabs);

  assert.equal(issues.length, 3);
  assert.equal(issues[0].line, 2);
  assert.equal(issues[0].tabCount, 1);

  const converted = convertTabsToSpaces(yamlWithTabs, 2);
  assert.equal(converted.includes('\t'), false);
  const reLint = lintYamlTabs(converted);
  assert.equal(reLint.length, 0);
});

test('Semantic equality: objects are order-agnostic by default', () => {
  const obj1 = { z: 1, a: 2, m: { y: 10, x: 20 } };
  const obj2 = { a: 2, z: 1, m: { x: 20, y: 10 } };
  assert.equal(areValuesEqual(obj1, obj2), true);
});

test('Semantic equality: list ordering toggle works', () => {
  const list1 = [1, 2, 3];
  const list2 = [3, 1, 2];

  // Default: strict order
  assert.equal(areValuesEqual(list1, list2, false), false);

  // Toggle on: ignore list order
  assert.equal(areValuesEqual(list1, list2, true), true);
});

test('Quote types: single-quoted vs double-quoted strings are ignored by default', () => {
  const leftJsonc = `{\n  'name': 'service-a',\n  'env': 'production'\n}`;
  const rightJson = `{\n  "name": "service-a",\n  "env": "production"\n}`;

  const leftDoc = parseDocument(leftJsonc);
  const rightDoc = parseDocument(rightJson);

  const { stats } = computeSemanticDiff(leftDoc, rightDoc, {
    ignoreListOrder: false,
    ignoredFields: [],
    ignoreQuoteStyle: true,
  });

  assert.equal(stats.modified, 0);
  assert.equal(stats.addedRight, 0);
  assert.equal(stats.deletedRight, 0);
});

test('TOML support: detects, parses, diffs, and serializes TOML files', () => {
  const leftToml = `[package]\nname = "demo"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1.0"\n`;
  const rightToml = `[dependencies]\nserde = '1.0'\ntokio = '1.37'\n\n[package]\nversion = '0.2.0'\nname = 'demo'\n`;

  assert.equal(detectFormat(leftToml), 'toml');
  assert.equal(detectFormat(rightToml), 'toml');

  const leftDoc = parseDocument(leftToml);
  const rightDoc = parseDocument(rightToml);

  const { rows, stats } = computeSemanticDiff(leftDoc, rightDoc, {
    ignoreListOrder: false,
    ignoredFields: [],
    ignoreQuoteStyle: true,
  });

  // version modified (0.1.0 -> 0.2.0), tokio added
  assert.equal(stats.modified, 1);
  assert.equal(stats.addedRight, 1);

  const serialized = serializePreservingFormat(leftDoc.data, rightDoc);
  assert.ok(serialized.includes('[package]'));
  assert.ok(serialized.includes('name = "demo"'));
});

test('Code folding: ancestorBlockIds populated on child rows and closing footers', () => {
  const leftRaw = `{\n  "server": {\n    "host": "localhost",\n    "port": 8080\n  }\n}`;
  const rightRaw = `{\n  "server": {\n    "host": "localhost",\n    "port": 9090\n  }\n}`;

  const leftDoc = parseDocument(leftRaw, 'json');
  const rightDoc = parseDocument(rightRaw, 'json');
  const { rows } = computeSemanticDiff(leftDoc, rightDoc, {
    ignoreListOrder: false,
    ignoredFields: [],
  });

  const serverHeader = rows.find((r) => r.left?.key === 'server' && r.left?.isBlockHeader);
  assert.ok(serverHeader, 'server block header exists');
  const serverBlockId = serverHeader.blockId!;
  assert.ok(serverBlockId);

  // Header itself should NOT have serverBlockId in its ancestorBlockIds
  assert.equal(serverHeader.ancestorBlockIds?.includes(serverBlockId), false);

  // Child rows (host, port) and closing brace of server MUST have serverBlockId in ancestorBlockIds
  const hostRow = rows.find((r) => r.left?.key === 'host');
  const portRow = rows.find((r) => r.left?.key === 'port');
  const serverFooter = rows.find((r) => r.left?.isBlockFooter && r.blockId === serverBlockId);

  assert.ok(hostRow?.ancestorBlockIds?.includes(serverBlockId));
  assert.ok(portRow?.ancestorBlockIds?.includes(serverBlockId));
  assert.ok(serverFooter?.ancestorBlockIds?.includes(serverBlockId));
});

test('K8s CRD Ignored Fields & Selective Merge All (skip vs include ignorable fields)', () => {
  const ignored = ['managedFields', 'resourceVersion', 'creationTimestamp', 'uid'];
  assert.equal(isFieldIgnored('resourceVersion', '$.metadata.resourceVersion', ignored), true);
  assert.equal(isFieldIgnored('replicas', '$.spec.replicas', ignored), false);

  const leftData = {
    metadata: { name: 'app', resourceVersion: '100', uid: 'left-uid' },
    spec: { replicas: 3 },
  };
  const rightData = {
    metadata: { name: 'app', resourceVersion: '200', uid: 'right-uid' },
    spec: { replicas: 5 },
  };

  // Merge Left -> Right while SKIPPING ignorable fields
  const safeMerged = mergeDataTrees(leftData, rightData, ignored, false);
  assert.equal(safeMerged.spec.replicas, 3); // real diff was merged!
  assert.equal(safeMerged.metadata.resourceVersion, '200'); // ignorable field preserved!
  assert.equal(safeMerged.metadata.uid, 'right-uid'); // ignorable field preserved!

  // Merge Left -> Right INCLUDING ignorable fields
  const fullMerged = mergeDataTrees(leftData, rightData, ignored, true);
  assert.equal(fullMerged.spec.replicas, 3);
  assert.equal(fullMerged.metadata.resourceVersion, '100'); // overwritten!
  assert.equal(fullMerged.metadata.uid, 'left-uid'); // overwritten!
});

test('In-place patcher: handles both standard JSONPaths and bracket-quoted dotted keys', () => {
  const obj = {
    metadata: {
      labels: {
        'app.kubernetes.io/name': 'payment-service',
      },
    },
    spec: {
      template: {
        containers: [{ name: 'app', image: 'nginx:1.14' }],
      },
    },
  };

  // Standard path
  assert.equal(getValueAtPath(obj, '$.spec.template.containers[0].image'), 'nginx:1.14');
  const updated1 = setValueAtPath(obj, '$.spec.template.containers[0].image', 'nginx:1.25');
  assert.equal(getValueAtPath(updated1, '$.spec.template.containers[0].image'), 'nginx:1.25');

  // Dotted key path (like K8s labels)
  const labelPath = "$.metadata.labels['app.kubernetes.io/managed-by']";
  const updated2 = setValueAtPath(updated1, labelPath, 'argocd');
  assert.equal(getValueAtPath(updated2, labelPath), 'argocd');
  assert.equal(updated2.metadata.labels['app.kubernetes.io/managed-by'], 'argocd');
});

test('Cross-format YAML vs JSON: compares semantically without orphan closing-brace spacers', () => {
  const leftYaml = `service: checkout-api\nversion: 2.1.0\ndatabase:\n  host: db.internal\n  port: 5432\n`;
  const rightJson = `{"database":{"port":5432,"host":"db.internal"},"service":"checkout-api","version":"2.2.0"}`;

  const leftDoc = parseDocument(leftYaml);
  const rightDoc = parseDocument(rightJson);

  assert.equal(leftDoc.format, 'yaml');
  assert.equal(rightDoc.format, 'json');

  const { rows, stats } = computeSemanticDiff(leftDoc, rightDoc, {
    ignoreListOrder: false,
    ignoredFields: [],
    ignoreQuoteStyle: true,
  });

  // Only version changed (2.1.0 -> 2.2.0)
  assert.equal(stats.modified, 1);
  assert.equal(stats.addedRight, 0);
  assert.equal(stats.deletedRight, 0);

  // Verify no closing-brace footer rows were emitted when comparing YAML against JSON
  const footerRows = rows.filter((r) => r.left?.isBlockFooter || r.right?.isBlockFooter);
  assert.equal(footerRows.length, 0);

  // Verify format conversion helper works across YAML -> TOML -> JSON
  const asToml = convertDocumentToFormat(leftDoc, 'toml');
  assert.ok(asToml.includes('service = "checkout-api"'));
  assert.ok(asToml.includes('[database]'));
});

test('Inline value parser and split intra-line character diffing', () => {
  assert.equal(parseInlineValue('true'), true);
  assert.equal(parseInlineValue('false'), false);
  assert.equal(parseInlineValue('null'), null);
  assert.equal(parseInlineValue('5432'), 5432);
  assert.equal(parseInlineValue('"hello"'), 'hello');
  assert.equal(parseInlineValue("'world'"), 'world');
  assert.equal(parseInlineValue('plain-string'), 'plain-string');

  const diff = computeIntraLineDiff('  image: "payments:v1.4.2"', '  image: "payments:v1.5.0"');
  assert.equal(diff.prefix, '  image: "payments:v1.');
  assert.equal(diff.leftMid, '4.2');
  assert.equal(diff.rightMid, '5.0');
  assert.equal(diff.suffix, '"');
});

test('Two-side format conversion: changing format on Left then Right realigns cleanly without shifting data', () => {
  // Start with reordered JSONC objects where Left first key is "name" and Right first key is "settings"
  const leftJsonc = `{\n  // Left header\n  "name": "core-analytics",\n  "version": "3.1.0",\n  "settings": {\n    "theme": "dark",\n    "cacheTtlSeconds": 3600\n  }\n}`;
  const rightJsonc = `{\n  // Right header\n  "settings": {\n    "cacheTtlSeconds": 7200,\n    "theme": "dark"\n  },\n  "version": "3.2.0",\n  "name": "core-analytics",\n  "extra": true\n}`;

  const baseL = parseDocument(leftJsonc);
  const baseR = parseDocument(rightJsonc);
  const baseDiff = computeSemanticDiff(baseL, baseR, { ignoreListOrder: false, ignoredFields: [] });
  assert.equal(baseDiff.stats.modified, 2); // version & cacheTtlSeconds
  assert.equal(baseDiff.stats.addedRight, 1); // extra
  assert.equal(baseDiff.stats.deletedRight, 0);

  // Convert Left and Right through every format pair (yaml, json, jsonc, toml)
  for (const fmtL of ['yaml', 'json', 'jsonc', 'toml'] as const) {
    for (const fmtR of ['yaml', 'json', 'jsonc', 'toml'] as const) {
      const convL = parseDocument(convertDocumentToFormat(baseL, fmtL));
      const convR = parseDocument(convertDocumentToFormat(baseR, fmtR));
      assert.equal(convL.format, fmtL);
      assert.equal(convR.format, fmtR);

      const pairDiff = computeSemanticDiff(convL, convR, {
        ignoreListOrder: false,
        ignoredFields: [],
      });
      assert.equal(pairDiff.stats.modified, 2, `modified mismatch for ${fmtL} vs ${fmtR}`);
      assert.equal(pairDiff.stats.addedRight, 1, `addedRight mismatch for ${fmtL} vs ${fmtR}`);
      assert.equal(pairDiff.stats.deletedRight, 0, `deletedRight mismatch for ${fmtL} vs ${fmtR}`);
    }
  }
});

test('Diff Report Exporter: generates Markdown, JSON, and Plain Text reports', () => {
  const leftDoc = parseDocument(`service: billing\nreplicas: 2\nresourceVersion: "10"\n`);
  const rightDoc = parseDocument(`service: billing\nreplicas: 4\nregion: eu-west\nresourceVersion: "11"\n`);
  const ignoredFields = ['resourceVersion'];
  const { rows, stats } = computeSemanticDiff(leftDoc, rightDoc, {
    ignoreListOrder: false,
    ignoredFields,
  });

  const mdReport = generateDiffReport({
    leftDoc,
    rightDoc,
    rows,
    stats,
    format: 'markdown',
    includeIgnored: false,
    ignoredFields,
  });
  assert.ok(mdReport.includes('# SemantiCompare — Semantic Diff Report'));
  assert.ok(mdReport.includes('$.replicas'));
  assert.ok(mdReport.includes('$.region'));
  assert.equal(mdReport.includes('| **Ignored (CRD)** | `$.resourceVersion`'), false);

  const jsonReport = JSON.parse(
    generateDiffReport({
      leftDoc,
      rightDoc,
      rows,
      stats,
      format: 'json',
      includeIgnored: true,
      ignoredFields,
    })
  );
  assert.equal(jsonReport.summary.modified, 1);
  assert.equal(jsonReport.summary.addedRight, 1);
  assert.equal(jsonReport.summary.ignoredDiff, 1);
  assert.equal(jsonReport.differences.length, 3);
});

test('Unordered array alignment (ignoreListOrder: true): aligns modified objects by identity key or structural similarity without false delete/add splits', () => {
  const leftYaml = `
containers:
  - name: payment-api
    image: "pay:v2.4.0"
    env:
      - name: ENVIRONMENT
        value: "production"
      - name: DB_POOL_SIZE
        value: "20"
  - name: redis-cache
    image: "redis:7.2"
`;
  // Right reorders containers AND reorders env vars while modifying DB_POOL_SIZE and payment-api image
  const rightYaml = `
containers:
  - name: redis-cache
    image: "redis:7.2"
  - name: payment-api
    image: "pay:v2.5.1"
    env:
      - name: DB_POOL_SIZE
        value: "35"
      - name: ENVIRONMENT
        value: "production"
      - name: FEATURE_INSTANT_PAYOUTS
        value: "enabled"
`;

  const leftDoc = parseDocument(leftYaml);
  const rightDoc = parseDocument(rightYaml);

  const { rows, stats } = computeSemanticDiff(leftDoc, rightDoc, {
    ignoreListOrder: true,
    ignoredFields: [],
  });

  // Zero items were deleted! Only 2 leaf values were modified (image and DB_POOL_SIZE.value) and 1 env item (3 rows: header + name + value) was added
  assert.equal(stats.deletedRight, 0, 'Should not mark modified objects in unordered arrays as deleted');
  assert.equal(stats.modified, 2, 'Only payment-api image and DB_POOL_SIZE value should be marked modified');

  // Verify that DB_POOL_SIZE value row has accurate left.path (env[1].value) and right.path (env[0].value)
  const poolSizeRow = rows.find(
    (r) => r.left?.key === 'value' && r.left?.value === '20' && r.right?.value === '35'
  );
  assert.ok(poolSizeRow, 'DB_POOL_SIZE value row should be aligned side-by-side');
  assert.equal(poolSizeRow.left?.path, '$.containers[0].env[1].value');
  assert.equal(poolSizeRow.right?.path, '$.containers[1].env[0].value');
});

test('Paste Validation (validatePastedDocument): accepts valid JSON/JSONC/YAML/TOML and rejects invalid syntax', () => {
  // Valid formats
  assert.equal(validatePastedDocument('{"service": "auth", "port": 8080}').valid, true);
  assert.equal(
    validatePastedDocument('{\n  // JSONC comment\n  "service": "auth",\n}').valid,
    true
  );
  assert.equal(validatePastedDocument('service: auth\nport: 8080\n').valid, true);
  assert.equal(validatePastedDocument('[package]\nname = "demo"\n').valid, true);

  // Invalid / malformed formats
  const badJsonUnclosed = validatePastedDocument('{"service": "auth", "port": 8080');
  assert.equal(badJsonUnclosed.valid, false);
  assert.ok(badJsonUnclosed.error?.includes('Invalid JSON'));

  const badJsonSyntax = validatePastedDocument('{"service": "auth", "port": }');
  assert.equal(badJsonSyntax.valid, false);
  assert.ok(badJsonSyntax.error?.includes('Invalid JSON'));

  const badYamlSyntax = validatePastedDocument('service: auth\n  badIndent: [unclosed');
  assert.equal(badYamlSyntax.valid, false);
  assert.ok(badYamlSyntax.error?.includes('Invalid YAML'));

  const plainSentence = validatePastedDocument('just some plain unstructured sentence');
  assert.equal(plainSentence.valid, false);
  assert.ok(plainSentence.error?.includes('Invalid JSON/YAML'));
});

test('Live Editor line parsing & key renaming (parseEditedLine & renameKeyAtPath)', () => {
  const editedVal = parseEditedLine('  "replicas": 5', 'replicas', false);
  assert.equal(editedVal.key, 'replicas');
  assert.equal(editedVal.value, 5);
  assert.equal(editedVal.isValueComplete, true);
  assert.equal(editedVal.isKeyRenamed, false);

  const renamedKey = parseEditedLine('  "maxReplicas": 10', 'replicas', false);
  assert.equal(renamedKey.key, 'maxReplicas');
  assert.equal(renamedKey.value, 10);
  assert.equal(renamedKey.isValueComplete, true);
  assert.equal(renamedKey.isKeyRenamed, true);

  const originalTree = {
    service: 'api',
    spec: {
      replicas: 3,
      strategy: 'RollingUpdate',
    },
  };
  const { data: updatedTree, newPath } = renameKeyAtPath(
    originalTree,
    '$.spec.replicas',
    'replicas',
    'maxReplicas',
    10
  );
  assert.equal(newPath, '$.spec.maxReplicas');
  assert.deepEqual(Object.keys(updatedTree.spec), ['maxReplicas', 'strategy']);
  assert.equal(updatedTree.spec.maxReplicas, 10);
});

