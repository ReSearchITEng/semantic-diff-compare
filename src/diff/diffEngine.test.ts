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
} from './inPlacePatcher';
import { detectFormat, parseDocument } from './parser';
import { convertDocumentToFormat } from './formatter';

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

test('Inline value parser and Beyond Compare intra-line character diffing', () => {
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

