import { copyFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * 构建结束后写入 dist，便于上传静态资源时仍保留「配置说明 + 本次打进前端的 VITE 变量快照」。
 * 注意：不含 .env 密钥文件；敏感项勿放 VITE_*（VITE_ 会进 JS，本文件仅作运维核对）。
 */
function distDeployArtifactsPlugin(
  root: string,
  viteEnv: Record<string, string>
): Plugin {
  return {
    name: 'dist-deploy-artifacts',
    apply: 'build',
    closeBundle() {
      const outDir = join(root, 'dist');

      const viteSnapshot: Record<string, string> = {};
      for (const key of Object.keys(viteEnv)) {
        if (key.startsWith('VITE_')) viteSnapshot[key] = viteEnv[key] ?? '';
      }

      writeFileSync(
        join(outDir, 'deploy-config.json'),
        JSON.stringify(
          {
            ...viteSnapshot,
            builtAt: new Date().toISOString(),
          },
          null,
          2
        ),
        'utf8'
      );

      const envExample = join(root, '.env.example');
      if (existsSync(envExample)) {
        copyFileSync(envExample, join(outDir, 'env.example'));
      }

      const pkgPath = join(root, 'package.json');
      if (existsSync(pkgPath)) {
        copyFileSync(pkgPath, join(outDir, 'package.json'));
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const root = process.cwd();
  const viteEnv = loadEnv(mode, root, 'VITE_');

  return {
    plugins: [react(), distDeployArtifactsPlugin(root, viteEnv)],
    /** `public/` 下文件会原样复制到 `dist/`（如 SPA 用的 `_redirects`） */
    publicDir: 'public',
    server: {
      // 允许手机等同局域网设备通过本机 IP 访问（需与电脑同一 Wi‑Fi）
      host: true,
      port: 5173,
    },
    // Zeabur Web Service：`npm start` 使用 `vite preview`，需允许外部域名与 PORT（见 package.json）
    preview: {
      host: '0.0.0.0',
      port: 8080,
      strictPort: false,
      allowedHosts: true,
    },
  };
});
