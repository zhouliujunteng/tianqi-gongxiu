import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { RootErrorBoundary } from './components/RootErrorBoundary';
import { bootstrapWechatOpenId } from './payment/useWechatOpenId';
import './index.css';

// 微信内先把支付用的 openId 准备好再渲染，避免页面渲染后再跳转导致「滑动时刷新回顶部」
void bootstrapWechatOpenId().then((shouldRender) => {
  if (!shouldRender) return;
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </React.StrictMode>
  );
});
