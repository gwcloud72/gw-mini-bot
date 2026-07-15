import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import postcss from 'postcss';

const PROJECT_ROOT_URL = new URL('../', import.meta.url);
const SOURCE_DIRECTORY_URL = new URL('../src/', import.meta.url);
const SOURCE_STYLESHEET_URL = new URL('../src/styles/index.css', import.meta.url);
const BUILT_ASSET_DIRECTORY_URL = new URL('../dist/assets/', import.meta.url);
const DOCUMENT_ENTRY_URL = new URL('../index.html', import.meta.url);

const violations = [];

const requiredTypographyTokens = new Map([
  ['--type-family-sans', 'var(--font-sans)'],
  ['--type-family-mono', 'var(--font-mono)'],
  ['--type-size-micro', '0.6875rem'],
  ['--type-size-caption', '0.75rem'],
  ['--type-size-label', '0.8125rem'],
  ['--type-size-ui', '0.875rem'],
  ['--type-size-body', '1rem'],
  ['--type-size-subtitle', '1.0625rem'],
  ['--type-size-title', 'clamp(1.0625rem, 1.03125rem + 0.14vw, 1.125rem)'],
  ['--type-size-code', '0.8125rem'],
  ['--type-size-table', '0.875rem'],
  ['--type-weight-regular', '400'],
  ['--type-weight-medium', '500'],
  ['--type-weight-semibold', '600'],
  ['--type-weight-bold', '700'],
  ['--type-line-height-tight', '1.3'],
  ['--type-line-height-snug', '1.45'],
  ['--type-line-height-normal', '1.55'],
  ['--type-line-height-body', '1.62'],
  ['--type-line-height-code', '1.6'],
  ['--type-letter-spacing-title', '-0.018em'],
  ['--type-letter-spacing-body', '-0.004em'],
  ['--type-letter-spacing-label', '-0.006em'],
  ['--type-letter-spacing-caption', '0'],
  ['--type-letter-spacing-number', '0'],
  ['--type-letter-spacing-badge', '0.012em'],
  ['--type-letter-spacing-mono', '0'],
]);

const requiredSemanticSelectors = [
  '.chat-title',
  '.chat-status',
  '.new-chat-button-label',
  '.intro-eyebrow',
  '.intro-title',
  '.intro-description',
  '.connection-banner-content',
  '.date-chip',
  '.message-bubble',
  '.message-time',
  '.message-status',
  '.quick-prompt-heading',
  '.quick-prompt-title',
  '.quick-prompt-description',
  '.quota-message-title',
  '.quota-message-copy',
  '.retry-button',
  '.jump-button',
  '.composer-textarea',
  '.character-count',
  '.menu-title',
  '.menu-description',
  '.menu-footer-copy',
  '.skin-picker-title',
  '.skin-picker-description',
  '.skin-option-title',
  '.skin-option-description',
  '.season-badge',
  '.menu-action-title',
  '.menu-action-description',
  '.connection-card-label',
  '.connection-card-value',
  '.message-markdown h1',
  '.message-markdown h2',
  '.message-markdown :where(h3, h4, h5, h6)',
  '.message-markdown :not(pre) > code',
  '.code-block pre',
  '.message-markdown table',
];

const requiredComponentClassNames = [
  'chat-title',
  'chat-status',
  'new-chat-button-label',
  'intro-eyebrow',
  'intro-title',
  'intro-description',
  'connection-banner-content',
  'date-chip',
  'message-bubble',
  'message-time',
  'message-status',
  'quick-prompt-heading',
  'quick-prompt-title',
  'quick-prompt-description',
  'quota-message-title',
  'quota-message-copy',
  'composer-textarea',
  'character-count',
  'menu-title',
  'menu-description',
  'menu-footer-copy',
  'skin-picker-title',
  'skin-picker-description',
  'skin-option-title',
  'skin-option-description',
  'menu-action-title',
  'menu-action-description',
  'connection-card-label',
  'connection-card-value',
];

const forbiddenSourcePatterns = [
  {
    label: '임의 Tailwind 글자 크기',
    pattern: /\b(?:sm:|md:|lg:|xl:|2xl:)?text-\[(?:\d|clamp\(|min\(|max\()/g,
  },
  {
    label: 'Tailwind 사전 정의 글자 크기',
    pattern: /\b(?:sm:|md:|lg:|xl:|2xl:)?text-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g,
  },
  {
    label: '임의 Tailwind 글꼴',
    pattern: /\b(?:sm:|md:|lg:|xl:|2xl:)?font-\[[^\]]+\]/g,
  },
  {
    label: 'Tailwind 글자 굵기',
    pattern: /\b(?:sm:|md:|lg:|xl:|2xl:)?font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/g,
  },
  {
    label: 'Tailwind 줄높이',
    pattern: /\b(?:sm:|md:|lg:|xl:|2xl:)?leading-(?:none|tight|snug|normal|relaxed|loose|\d+|\[[^\]]+\])\b/g,
  },
  {
    label: 'Tailwind 자간',
    pattern: /\b(?:sm:|md:|lg:|xl:|2xl:)?tracking-(?:tighter|tight|normal|wide|wider|widest|\[[^\]]+\])\b/g,
  },
  {
    label: 'JSX 인라인 타이포그래피 값',
    pattern: /\b(?:fontFamily|fontSize|fontWeight|lineHeight|letterSpacing)\s*:/g,
  },
];

const forbiddenBuiltTypographySelectorPatterns = [
  /\.text-(?:xs|sm|base|lg|xl|[2-9]xl)(?:\b|\\:)/,
  /\.font-(?:sans|serif|mono|thin|extralight|light|normal|medium|semibold|bold|extrabold|black)(?:\b|\\:)/,
  /\.font-\\\[/,
  /\.leading-(?:none|tight|snug|normal|relaxed|loose|\d+|\\\[)/,
  /\.tracking-(?:tighter|tight|normal|wide|wider|widest|\\\[)/,
];

const ignoredDirectoryNames = new Set(['.git', '.wrangler', 'dist', 'node_modules']);
const forbiddenFontFileExtensions = new Set(['.eot', '.otf', '.ttf', '.woff', '.woff2']);

async function collectFiles(directoryPath, acceptedExtensions = null) {
  const directoryEntries = await readdir(directoryPath, { withFileTypes: true });
  const collectedFiles = [];

  for (const directoryEntry of directoryEntries) {
    if (ignoredDirectoryNames.has(directoryEntry.name)) {
      continue;
    }

    const entryPath = join(directoryPath, directoryEntry.name);
    if (directoryEntry.isDirectory()) {
      collectedFiles.push(...await collectFiles(entryPath, acceptedExtensions));
      continue;
    }

    if (!directoryEntry.isFile()) {
      continue;
    }

    if (!acceptedExtensions || acceptedExtensions.has(extname(directoryEntry.name))) {
      collectedFiles.push(entryPath);
    }
  }

  return collectedFiles;
}

async function inspectComponentSources() {
  const sourceDirectoryPath = SOURCE_DIRECTORY_URL.pathname;
  const projectRootPath = PROJECT_ROOT_URL.pathname;
  const sourceFiles = await collectFiles(sourceDirectoryPath, new Set(['.ts', '.tsx']));
  let joinedComponentSource = '';

  for (const sourceFilePath of sourceFiles) {
    const sourceText = await readFile(sourceFilePath, 'utf8');
    joinedComponentSource += `\n${sourceText}`;

    for (const forbiddenRule of forbiddenSourcePatterns) {
      const matches = [...sourceText.matchAll(forbiddenRule.pattern)];
      for (const match of matches) {
        const lineNumber = sourceText.slice(0, match.index).split('\n').length;
        violations.push(
          `${forbiddenRule.label}: ${relative(projectRootPath, sourceFilePath)}:${lineNumber} -> ${match[0]}`,
        );
      }
    }
  }

  for (const requiredClassName of requiredComponentClassNames) {
    if (!joinedComponentSource.includes(requiredClassName)) {
      violations.push(`컴포넌트에서 의미 타이포그래피 클래스 미사용: ${requiredClassName}`);
    }
  }

  return sourceFiles.length;
}

function inspectTypographyDeclaration(cssDeclaration, sourceLabel) {
  const propertyName = cssDeclaration.prop.toLowerCase();
  const propertyValue = cssDeclaration.value.trim();
  const lineNumber = cssDeclaration.source?.start?.line ?? 0;
  const allowedValuePrefixes = {
    'font-family': ['var(--type-family-'],
    'font-size': ['var(--type-size-'],
    'font-weight': ['var(--type-weight-'],
    'line-height': ['var(--type-line-height-'],
    'letter-spacing': ['var(--type-letter-spacing-', 'inherit'],
  };

  if (propertyName === 'font' && propertyValue !== 'inherit') {
    violations.push(
      `font shorthand는 inherit만 허용: ${sourceLabel}:${lineNumber} -> ${propertyValue}`,
    );
    return;
  }

  const allowedPrefixes = allowedValuePrefixes[propertyName];
  if (!allowedPrefixes) {
    return;
  }

  if (!allowedPrefixes.some((allowedPrefix) => propertyValue.startsWith(allowedPrefix))) {
    violations.push(
      `토큰을 거치지 않은 ${propertyName}: ${sourceLabel}:${lineNumber} -> ${propertyValue}`,
    );
  }
}

function collectRuleDeclarations(stylesheetRoot) {
  const declarationsBySelector = new Map();

  stylesheetRoot.walkRules((cssRule) => {
    for (const cssSelector of cssRule.selectors) {
      const selectorDeclarations = new Map();
      cssRule.walkDecls((cssDeclaration) => {
        selectorDeclarations.set(cssDeclaration.prop, cssDeclaration.value.trim());
      });
      declarationsBySelector.set(cssSelector, selectorDeclarations);
    }
  });

  return declarationsBySelector;
}

function requireRuleDeclaration(declarationsBySelector, selector, propertyName, expectedValue) {
  const selectorDeclarations = declarationsBySelector.get(selector);
  if (!selectorDeclarations) {
    violations.push(`필수 타이포그래피 선택자 누락: ${selector}`);
    return;
  }

  const actualValue = selectorDeclarations.get(propertyName);
  if (actualValue !== expectedValue) {
    violations.push(
      `${selector}의 ${propertyName} 불일치: expected ${expectedValue}, received ${actualValue ?? 'missing'}`,
    );
  }
}

async function inspectAuthoredStylesheet() {
  const stylesheetSource = await readFile(SOURCE_STYLESHEET_URL, 'utf8');
  const requiredUtilitiesImport = '@import "tailwindcss/utilities.css" layer(utilities) source("../");';
  if (!stylesheetSource.includes(requiredUtilitiesImport)) {
    violations.push(
      'Tailwind source 탐색은 src 디렉터리로 제한해야 함: utilities import에 source("../") 누락',
    );
  }

  const stylesheetRoot = postcss.parse(stylesheetSource, { from: SOURCE_STYLESHEET_URL.pathname });
  const declaredTypographyTokens = new Map();
  const usedTypographyTokens = new Set();
  const authoredSelectors = new Set();

  stylesheetRoot.walkDecls((cssDeclaration) => {
    if (cssDeclaration.prop.startsWith('--type-')) {
      declaredTypographyTokens.set(cssDeclaration.prop, cssDeclaration.value.trim());
    }

    for (const tokenMatch of cssDeclaration.value.matchAll(/var\((--type-[a-z0-9-]+)\)/g)) {
      usedTypographyTokens.add(tokenMatch[1]);
    }

    inspectTypographyDeclaration(cssDeclaration, 'src/styles/index.css');
  });

  stylesheetRoot.walkRules((cssRule) => {
    for (const cssSelector of cssRule.selectors) {
      authoredSelectors.add(cssSelector);
    }
  });

  for (const [requiredToken, expectedValue] of requiredTypographyTokens) {
    const actualValue = declaredTypographyTokens.get(requiredToken);
    if (actualValue === undefined) {
      violations.push(`필수 타이포그래피 토큰 누락: ${requiredToken}`);
    } else if (actualValue !== expectedValue) {
      violations.push(
        `타이포그래피 토큰 값 불일치: ${requiredToken} -> expected ${expectedValue}, received ${actualValue}`,
      );
    }
  }

  for (const declaredToken of declaredTypographyTokens.keys()) {
    if (!usedTypographyTokens.has(declaredToken)) {
      violations.push(`사용되지 않는 타이포그래피 토큰: ${declaredToken}`);
    }
  }

  for (const requiredSelector of requiredSemanticSelectors) {
    if (!authoredSelectors.has(requiredSelector)) {
      violations.push(`필수 의미 타이포그래피 선택자 누락: ${requiredSelector}`);
    }
  }

  stylesheetRoot.walkAtRules('font-face', (fontFaceRule) => {
    violations.push(
      `프로젝트 내부 @font-face 금지: line ${fontFaceRule.source?.start?.line ?? 0}`,
    );
  });

  const declarationsBySelector = collectRuleDeclarations(stylesheetRoot);
  const sharedReadingRules = [
    ['body', 'font-size', 'var(--type-size-body)'],
    ['body', 'line-height', 'var(--type-line-height-body)'],
    ['body', 'letter-spacing', 'var(--type-letter-spacing-body)'],
    ['.message-bubble', 'font-size', 'var(--type-size-body)'],
    ['.message-bubble', 'line-height', 'var(--type-line-height-body)'],
    ['.message-bubble', 'letter-spacing', 'var(--type-letter-spacing-body)'],
    ['.composer-textarea', 'font-size', 'var(--type-size-body)'],
    ['.composer-textarea', 'line-height', 'var(--type-line-height-body)'],
    ['.composer-textarea', 'letter-spacing', 'var(--type-letter-spacing-body)'],
    ['.date-chip', 'font-variant-numeric', 'tabular-nums'],
    ['.message-time', 'font-variant-numeric', 'tabular-nums'],
    ['.character-count', 'font-variant-numeric', 'tabular-nums'],
  ];

  for (const [selector, propertyName, expectedValue] of sharedReadingRules) {
    requireRuleDeclaration(declarationsBySelector, selector, propertyName, expectedValue);
  }

  return {
    declaredTokenCount: declaredTypographyTokens.size,
    usedTokenCount: usedTypographyTokens.size,
  };
}

async function inspectDocumentEntry() {
  const documentMarkup = await readFile(DOCUMENT_ENTRY_URL, 'utf8');
  const requiredFragments = [
    '<html lang="ko"',
    'rel="preconnect" href="https://unpkg.com" crossorigin',
    'pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css',
    'crossorigin="anonymous"',
    'referrerpolicy="no-referrer"',
  ];

  for (const requiredFragment of requiredFragments) {
    if (!documentMarkup.includes(requiredFragment)) {
      violations.push(`index.html 타이포그래피 설정 누락: ${requiredFragment}`);
    }
  }

  const pretendardStylesheetMatches = documentMarkup.match(/pretendardvariable-dynamic-subset\.css/g) ?? [];
  if (pretendardStylesheetMatches.length !== 1) {
    violations.push(`Pretendard stylesheet는 정확히 1개여야 함: ${pretendardStylesheetMatches.length}개`);
  }
}

async function inspectFontAssets() {
  const projectRootPath = PROJECT_ROOT_URL.pathname;
  const projectFiles = await collectFiles(projectRootPath);
  const bundledFontFiles = projectFiles.filter((filePath) =>
    forbiddenFontFileExtensions.has(extname(filePath).toLowerCase()),
  );

  for (const bundledFontFile of bundledFontFiles) {
    violations.push(
      `프로젝트에 폰트 바이너리 포함 금지: ${relative(projectRootPath, bundledFontFile)}`,
    );
  }

  return bundledFontFiles.length;
}

async function inspectBuiltStylesheets() {
  let builtAssetNames;
  try {
    builtAssetNames = await readdir(BUILT_ASSET_DIRECTORY_URL);
  } catch {
    violations.push('프로덕션 타이포그래피 검사를 위한 dist/assets가 없습니다. 먼저 npm run build를 실행하세요.');
    return 0;
  }

  const builtStylesheetNames = builtAssetNames.filter((assetName) => assetName.endsWith('.css'));
  if (builtStylesheetNames.length === 0) {
    violations.push('dist/assets에서 프로덕션 CSS 파일을 찾지 못했습니다.');
    return 0;
  }

  for (const builtStylesheetName of builtStylesheetNames) {
    const builtStylesheetUrl = new URL(builtStylesheetName, BUILT_ASSET_DIRECTORY_URL);
    const builtStylesheetSource = await readFile(builtStylesheetUrl, 'utf8');
    const builtStylesheetRoot = postcss.parse(builtStylesheetSource, { from: builtStylesheetUrl.pathname });

    builtStylesheetRoot.walkRules((cssRule) => {
      for (const forbiddenSelectorPattern of forbiddenBuiltTypographySelectorPatterns) {
        if (forbiddenSelectorPattern.test(cssRule.selector)) {
          violations.push(
            `프로덕션 CSS에 금지된 Tailwind 타이포그래피 utility: dist/assets/${builtStylesheetName} -> ${cssRule.selector}`,
          );
        }
      }
    });

    builtStylesheetRoot.walkDecls((cssDeclaration) => {
      inspectTypographyDeclaration(cssDeclaration, `dist/assets/${builtStylesheetName}`);
    });
  }

  return builtStylesheetNames.length;
}

const sourceFileCount = await inspectComponentSources();
const authoredInspection = await inspectAuthoredStylesheet();
await inspectDocumentEntry();
const bundledFontFileCount = await inspectFontAssets();
const builtStylesheetCount = await inspectBuiltStylesheets();

if (violations.length > 0) {
  console.error('타이포그래피 정책 검사 실패');
  for (const violationMessage of violations) {
    console.error(`- ${violationMessage}`);
  }
  process.exit(1);
}

console.log(
  `타이포그래피 정책 검사 통과: TS/TSX ${sourceFileCount}개, 토큰 ${authoredInspection.declaredTokenCount}개, 프로덕션 CSS ${builtStylesheetCount}개, 번들 폰트 ${bundledFontFileCount}개`,
);
