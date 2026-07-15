import { readdir, readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import postcss from 'postcss';

const SOURCE_STYLESHEET_URL = new URL('../src/styles/index.css', import.meta.url);
const BUILT_ASSET_DIRECTORY_URL = new URL('../dist/assets/', import.meta.url);
const violations = [];

function getAtRuleContext(cssNode) {
  const atRuleParts = [];
  let parentNode = cssNode.parent;

  while (parentNode && parentNode.type !== 'root') {
    if (parentNode.type === 'atrule') {
      atRuleParts.unshift(`@${parentNode.name} ${parentNode.params}`.trim());
    }
    parentNode = parentNode.parent;
  }

  return atRuleParts.join(' > ') || 'root';
}

function isInsideKeyframes(cssRule) {
  let parentNode = cssRule.parent;

  while (parentNode && parentNode.type !== 'root') {
    if (
      parentNode.type === 'atrule' &&
      ['keyframes', '-webkit-keyframes'].includes(parentNode.name)
    ) {
      return true;
    }
    parentNode = parentNode.parent;
  }

  return false;
}

async function inspectAuthoredStylesheet() {
  const stylesheetSource = await readFile(SOURCE_STYLESHEET_URL, 'utf8');
  const stylesheetRoot = postcss.parse(stylesheetSource, {
    from: SOURCE_STYLESHEET_URL.pathname,
  });
  const selectorOccurrences = new Map();
  const keyframeOccurrences = new Map();

  stylesheetRoot.walkAtRules((atRule) => {
    if (!['keyframes', '-webkit-keyframes'].includes(atRule.name)) {
      return;
    }

    const keyframeName = atRule.params.trim();
    const occurrenceLines = keyframeOccurrences.get(keyframeName) ?? [];
    occurrenceLines.push(atRule.source?.start?.line ?? 0);
    keyframeOccurrences.set(keyframeName, occurrenceLines);
  });

  stylesheetRoot.walkRules((cssRule) => {
    if (!isInsideKeyframes(cssRule)) {
      for (const cssSelector of cssRule.selectors) {
        if (cssSelector.includes('#')) {
          violations.push(
            `ID 선택자 금지: ${cssSelector} (line ${cssRule.source?.start?.line ?? 0})`,
          );
        }

        const selectorLocations = selectorOccurrences.get(cssSelector) ?? [];
        selectorLocations.push({
          line: cssRule.source?.start?.line ?? 0,
          context: getAtRuleContext(cssRule),
        });
        selectorOccurrences.set(cssSelector, selectorLocations);
      }
    }

    const declarationLinesByProperty = new Map();

    for (const childNode of cssRule.nodes ?? []) {
      if (childNode.type !== 'decl') {
        continue;
      }

      if (childNode.important) {
        violations.push(
          `!important 금지: ${childNode.prop} (line ${childNode.source?.start?.line ?? 0})`,
        );
      }

      const normalizedPropertyName = childNode.prop.toLowerCase();
      const declarationLines =
        declarationLinesByProperty.get(normalizedPropertyName) ?? [];
      declarationLines.push(childNode.source?.start?.line ?? 0);
      declarationLinesByProperty.set(normalizedPropertyName, declarationLines);
    }

    for (const [propertyName, declarationLines] of declarationLinesByProperty) {
      if (declarationLines.length > 1) {
        violations.push(
          `동일 규칙 속성 중복: ${cssRule.selector} -> ${propertyName} (${declarationLines.join(', ')})`,
        );
      }
    }
  });

  for (const [cssSelector, selectorLocations] of selectorOccurrences) {
    if (selectorLocations.length <= 1) {
      continue;
    }

    const formattedLocations = selectorLocations
      .map(({ line, context }) => `${context}:line ${line}`)
      .join(', ');
    violations.push(`선택자 중복: ${cssSelector} (${formattedLocations})`);
  }

  for (const [keyframeName, occurrenceLines] of keyframeOccurrences) {
    if (occurrenceLines.length > 1) {
      violations.push(
        `키프레임 이름 중복: ${keyframeName} (${occurrenceLines.join(', ')})`,
      );
    }
  }

  return {
    selectorCount: selectorOccurrences.size,
    keyframeCount: keyframeOccurrences.size,
  };
}

async function inspectBuiltStylesheets() {
  let builtAssetNames;

  try {
    builtAssetNames = await readdir(BUILT_ASSET_DIRECTORY_URL);
  } catch {
    violations.push(
      '프로덕션 CSS 검사를 위한 dist/assets가 없습니다. 먼저 npm run build를 실행하세요.',
    );
    return 0;
  }

  const builtStylesheetNames = builtAssetNames.filter((assetName) =>
    assetName.endsWith('.css'),
  );

  if (builtStylesheetNames.length === 0) {
    violations.push('dist/assets에서 프로덕션 CSS 파일을 찾지 못했습니다.');
    return 0;
  }

  for (const builtStylesheetName of builtStylesheetNames) {
    const builtStylesheetUrl = new URL(
      builtStylesheetName,
      BUILT_ASSET_DIRECTORY_URL,
    );
    const builtStylesheetSource = await readFile(builtStylesheetUrl, 'utf8');
    const builtStylesheetRoot = postcss.parse(builtStylesheetSource, {
      from: builtStylesheetUrl.pathname,
    });

    builtStylesheetRoot.walkDecls((cssDeclaration) => {
      if (!cssDeclaration.important) {
        return;
      }

      violations.push(
        `프로덕션 CSS !important 금지: ${basename(builtStylesheetUrl.pathname)} -> ${cssDeclaration.prop}`,
      );
    });
  }

  return builtStylesheetNames.length;
}

const authoredInspection = await inspectAuthoredStylesheet();
const builtStylesheetCount = await inspectBuiltStylesheets();

if (violations.length > 0) {
  console.error('CSS 무결성 검사 실패');
  for (const violationMessage of violations) {
    console.error(`- ${violationMessage}`);
  }
  process.exit(1);
}

console.log(
  `CSS 무결성 검사 통과: 작성 선택자 ${authoredInspection.selectorCount}개, 키프레임 ${authoredInspection.keyframeCount}개, 프로덕션 CSS ${builtStylesheetCount}개`,
);
