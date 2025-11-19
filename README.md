# 微信公众号封面下载器

一个简洁美观的微信公众号文章封面下载工具，支持自动解析和下载高清封面图。

## 功能特点

- 🎨 粉色到青色渐变的现代化UI设计
- 📱 自动解析微信公众号文章封面
- 🖼️ 自动获取高清版本封面（/640 → /0）
- ⬇️ 一键下载封面图片
- 💻 前后端均使用JavaScript开发

## 技术栈

- **前端**: HTML5 + CSS3 + Vanilla JavaScript
- **后端**: Node.js + Express
- **HTTP请求**: Axios

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
npm start
```

服务将在 `http://localhost:3000` 启动

### 使用方法

1. 打开浏览器访问 `http://localhost:3000`
2. 复制微信公众号文章链接
3. 粘贴到输入框中
4. 点击"解析封面"按钮
5. 等待解析完成后，点击"下载高清封面"按钮

## 项目结构

```
vxdownloader/
├── index.html          # 前端页面
├── server.js           # 后端服务
├── package.json        # 项目配置
└── README.md          # 项目说明
```

## API接口

### POST /api/parse

解析微信公众号文章封面

**请求体**:
```json
{
  "url": "https://mp.weixin.qq.com/s/xxxxx"
}
```

**响应**:
```json
{
  "success": true,
  "coverUrl": "https://mmbiz.qpic.cn/.../0",
  "originalUrl": "https://mp.weixin.qq.com/s/xxxxx"
}
```

## 注意事项

- 请确保输入的是有效的微信公众号文章链接
- 部分文章可能因为权限或其他原因无法解析
- 下载的图片格式通常为JPG

## 开发者

使用 Claude Code 创建

## 许可证

MIT
