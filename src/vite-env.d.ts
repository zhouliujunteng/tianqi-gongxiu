/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ZION_PROJECT_EX_ID: string;
  /** 微信网页授权完整入口 URL；可用 {REDIRECT} 占位表示编码后的当前页回跳地址 */
  readonly VITE_ZION_WECHAT_OAUTH_URL?: string;
  /** 开发：无用户库行时管理台 ?ref= 使用的用户库主键（与模拟帐户 id 不同时配置） */
  readonly VITE_DEV_INVITER_YONGHUKU_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
