import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteCliPath = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const indexHtml = await readFile(path.join(projectRoot, 'dist', 'index.html'), 'utf8');
const localAssetPath = indexHtml.match(
  /(?:src|href)="(\/(?:[^"]*\/)?assets\/[^"]+)"/,
)?.[1];

if (!localAssetPath) {
  throw new Error('dist/index.html에서 Vite asset 경로를 찾지 못했습니다.');
}

const assetSegmentIndex = localAssetPath.lastIndexOf('/assets/');
const basePathPrefix = localAssetPath.slice(0, assetSegmentIndex);
const previewBasePath = basePathPrefix ? `${basePathPrefix}/` : '/';

async function reserveFreePort() {
  return await new Promise((resolve, reject) => {
    const portServer = createServer();
    portServer.once('error', reject);
    portServer.listen(0, '127.0.0.1', () => {
      const serverAddress = portServer.address();
      if (!serverAddress || typeof serverAddress === 'string') {
        portServer.close();
        reject(new Error('미리보기 검사 포트를 확보하지 못했습니다.'));
        return;
      }

      const reservedPort = serverAddress.port;
      portServer.close((closeError) => {
        if (closeError) {
          reject(closeError);
        } else {
          resolve(reservedPort);
        }
      });
    });
  });
}

function createPreviewEnvironment() {
  const previewEnvironment = { ...process.env };
  for (const environmentName of Object.keys(previewEnvironment)) {
    if (environmentName.startsWith('VITE_')) {
      delete previewEnvironment[environmentName];
    }
  }
  delete previewEnvironment.GITHUB_ACTIONS;
  delete previewEnvironment.GITHUB_REPOSITORY;
  return previewEnvironment;
}

async function waitForPreview(previewUrl, previewProcess, outputBuffer) {
  for (let attemptNumber = 0; attemptNumber < 60; attemptNumber += 1) {
    if (previewProcess.exitCode !== null) {
      throw new Error(`Vite preview가 조기 종료됐습니다.\n${outputBuffer.join('')}`);
    }

    try {
      const previewResponse = await fetch(previewUrl, { redirect: 'error' });
      if (previewResponse.ok) {
        return previewResponse;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error(`Vite preview 시작 시간이 초과됐습니다.\n${outputBuffer.join('')}`);
}

async function stopPreview(previewProcess) {
  if (previewProcess.exitCode !== null) {
    return;
  }

  previewProcess.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => previewProcess.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);

  if (previewProcess.exitCode === null) {
    previewProcess.kill('SIGKILL');
  }
}

const previewPort = await reserveFreePort();
const previewOrigin = `http://127.0.0.1:${previewPort}`;
const previewUrl = `${previewOrigin}${previewBasePath}`;
const previewOutput = [];
const previewProcess = spawn(
  process.execPath,
  [
    viteCliPath,
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    String(previewPort),
    '--strictPort',
    '--clearScreen',
    'false',
  ],
  {
    cwd: projectRoot,
    env: createPreviewEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

previewProcess.stdout.on('data', (outputChunk) => previewOutput.push(outputChunk.toString()));
previewProcess.stderr.on('data', (outputChunk) => previewOutput.push(outputChunk.toString()));

try {
  const previewResponse = await waitForPreview(previewUrl, previewProcess, previewOutput);
  const previewHtml = await previewResponse.text();
  if (!previewHtml.includes('<div id="root"')) {
    throw new Error('Vite preview HTML에서 React root를 찾지 못했습니다.');
  }

  const javascriptAssetPath = previewHtml.match(
    /src="(\/(?:[^"]*\/)?assets\/[^"]+\.js)"/,
  )?.[1];
  const cssAssetPath = previewHtml.match(
    /href="(\/(?:[^"]*\/)?assets\/[^"]+\.css)"/,
  )?.[1];

  for (const assetPath of [javascriptAssetPath, cssAssetPath]) {
    if (!assetPath) {
      throw new Error('Vite preview HTML에서 JavaScript 또는 CSS asset을 찾지 못했습니다.');
    }

    const assetResponse = await fetch(`${previewOrigin}${assetPath}`, {
      redirect: 'error',
    });
    if (!assetResponse.ok) {
      throw new Error(`Vite preview asset 요청 실패: ${assetPath}`);
    }
  }

  console.log(`Vite preview 검사 통과: 환경변수 없이 ${previewBasePath} 제공`);
} finally {
  await stopPreview(previewProcess);
}
