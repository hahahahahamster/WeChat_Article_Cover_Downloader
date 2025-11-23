const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3001;

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件服务，添加缓存头
app.use(express.static(__dirname, {
    maxAge: '1y', // 图片和静态资源缓存1年
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
        // 为图片文件设置更长的缓存时间
        if (path.match(/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        // 为CSS和JS文件设置缓存
        if (path.match(/\.(css|js)$/i)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        // 为HTML文件设置较短的缓存时间
        if (path.match(/\.html$/i)) {
            res.setHeader('Cache-Control', 'public, max-age=3600');
        }
    }
}));

// 解析微信公众号封面接口
app.post('/api/parse', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: '请提供文章URL' });
        }

        // 验证URL格式
        if (!url.includes('mp.weixin.qq.com')) {
            return res.status(400).json({ error: '请提供有效的微信公众号文章链接' });
        }

        // 获取文章HTML
        console.log('正在获取文章:', url);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Referer': 'https://mp.weixin.qq.com/'
            },
            timeout: 15000
        });

        const html = response.data;

        // 多种方法解析封面URL
        let coverUrl = null;

        // 方法1: 匹配 msg_cdn_url
        const cdnMatch = html.match(/var\s+msg_cdn_url\s*=\s*["']([^"']+)["']/);
        if (cdnMatch && cdnMatch[1]) {
            coverUrl = cdnMatch[1];
        }

        // 方法2: 匹配 og:image meta标签
        if (!coverUrl) {
            const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
            if (ogImageMatch && ogImageMatch[1]) {
                coverUrl = ogImageMatch[1];
            }
        }

        // 方法3: 匹配 msg_link_desc 附近的图片URL
        if (!coverUrl) {
            const descMatch = html.match(/msg_link_desc[^>]*>(.*?)<\/p>/s);
            if (descMatch) {
                const imgMatch = html.match(/https?:\/\/mmbiz\.qpic\.cn\/[^"'\s]+/);
                if (imgMatch) {
                    coverUrl = imgMatch[0];
                }
            }
        }

        // 方法4: 匹配任何 mmbiz.qpic.cn 的图片
        if (!coverUrl) {
            const qpicMatches = html.match(/https?:\/\/mmbiz\.qpic\.cn\/[^"'\s]+/g);
            if (qpicMatches && qpicMatches.length > 0) {
                // 取第一张图片，通常是封面
                coverUrl = qpicMatches[0];
            }
        }

        if (!coverUrl) {
            console.error('未能解析出封面URL');
            return res.status(404).json({ error: '未能找到文章封面，请确认链接是否正确' });
        }

        // 清理URL中的转义字符
        coverUrl = coverUrl.replace(/&amp;/g, '&');

        // 将 /640 替换为 /0 以获取高清图
        coverUrl = coverUrl.replace(/\/640($|\?)/g, '/0$1');

        // 如果URL中没有/640，尝试在文件扩展名前添加/0
        if (!coverUrl.includes('/0') && !coverUrl.includes('/640')) {
            // 匹配最后一个路径段，在查询参数之前
            coverUrl = coverUrl.replace(/(\.[^.?]+)(\?|$)/, '/0$1$2');
        }

        console.log('解析成功，封面URL:', coverUrl);

        // 下载图片并转换为base64，绕过防盗链
        try {
            const imageResponse = await axios.get(coverUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://mp.weixin.qq.com/'
                },
                responseType: 'arraybuffer',
                timeout: 20000
            });

            const base64Image = Buffer.from(imageResponse.data, 'binary').toString('base64');
            const mimeType = imageResponse.headers['content-type'] || 'image/jpeg';
            const base64Data = `data:${mimeType};base64,${base64Image}`;

            console.log('图片下载成功，大小:', imageResponse.data.length, 'bytes');

            res.json({
                success: true,
                coverUrl: base64Data,
                originalUrl: url,
                imageUrl: coverUrl
            });
        } catch (imageError) {
            console.error('图片下载失败:', imageError.message);
            // 如果图片下载失败，仍返回URL让用户尝试
            res.json({
                success: true,
                coverUrl: coverUrl,
                originalUrl: url,
                warning: '图片加载可能受限，建议直接下载'
            });
        }

    } catch (error) {
        console.error('解析错误:', error.message);

        if (error.code === 'ECONNABORTED') {
            return res.status(408).json({ error: '请求超时，请重试' });
        }

        if (error.response) {
            return res.status(error.response.status).json({
                error: `无法访问该链接 (${error.response.status})`
            });
        }

        res.status(500).json({
            error: '解析失败，请检查链接是否正确或稍后重试'
        });
    }
});

// 健康检查接口
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: '服务运行正常' });
});

// robots.txt 路由
app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.sendFile(path.join(__dirname, 'robots.txt'));
});

// API 文档路由
app.get('/api/docs', (req, res) => {
    res.sendFile(path.join(__dirname, 'api-docs.html'));
});

// API 文档 JSON 接口（保留用于程序化访问）
app.get('/api/docs.json', (req, res) => {
    res.json({
        title: '微信公众号封面提取 API 文档',
        description: '免费API，支持一键提取微信公众号文章封面图',
        version: '1.0.0',
        baseUrl: req.protocol + '://' + req.get('host'),
        endpoints: {
            parse: {
                method: 'POST',
                path: '/api/parse',
                description: '解析微信公众号文章封面图',
                request: {
                    contentType: 'application/json',
                    body: {
                        url: {
                            type: 'string',
                            required: true,
                            description: '微信公众号文章链接，例如: https://mp.weixin.qq.com/s/xxxxx'
                        }
                    },
                    example: {
                        url: 'https://mp.weixin.qq.com/s/xxxxx'
                    }
                },
                response: {
                    success: {
                        status: 200,
                        body: {
                            success: true,
                            coverUrl: 'string (base64图片数据或图片URL)',
                            originalUrl: 'string (原始文章URL)',
                            imageUrl: 'string (原始图片URL，如果coverUrl是base64)'
                        },
                        example: {
                            success: true,
                            coverUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
                            originalUrl: 'https://mp.weixin.qq.com/s/xxxxx',
                            imageUrl: 'https://mmbiz.qpic.cn/.../0'
                        }
                    },
                    error: {
                        status: [400, 404, 408, 500],
                        body: {
                            error: 'string (错误信息)'
                        },
                        examples: [
                            { status: 400, error: '请提供文章URL' },
                            { status: 400, error: '请提供有效的微信公众号文章链接' },
                            { status: 404, error: '未能找到文章封面，请确认链接是否正确' },
                            { status: 408, error: '请求超时，请重试' },
                            { status: 500, error: '解析失败，请检查链接是否正确或稍后重试' }
                        ]
                    }
                },
                usage: {
                    curl: `curl -X POST ${req.protocol}://${req.get('host')}/api/parse \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://mp.weixin.qq.com/s/xxxxx"}'`,
                    javascript: `fetch('${req.protocol}://${req.get('host')}/api/parse', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'https://mp.weixin.qq.com/s/xxxxx'
  })
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));`,
                    python: `import requests

response = requests.post('${req.protocol}://${req.get('host')}/api/parse', json={
    'url': 'https://mp.weixin.qq.com/s/xxxxx'
})
print(response.json())`
                },
                rateLimit: '无限制，免费使用',
                notes: [
                    'API完全免费，无需注册或API密钥',
                    '支持所有微信公众号已发布的文章',
                    '返回的coverUrl可能是base64格式（推荐）或原始图片URL',
                    '建议使用base64格式的coverUrl，可绕过防盗链限制'
                ]
            },
            health: {
                method: 'GET',
                path: '/health',
                description: '健康检查接口',
                response: {
                    status: 200,
                    body: {
                        status: 'ok',
                        message: '服务运行正常'
                    }
                }
            }
        },
        support: {
            github: 'https://github.com/hahahahahamster/WeChat_Article_Cover_Downloader',
            issues: '如有问题，请在GitHub提交Issue'
        }
    });
});

// 教程页面路由
app.get('/tutorial', (req, res) => {
    res.sendFile(path.join(__dirname, 'tutorial.html'));
});

// 主页路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Vercel serverless 环境
module.exports = app;

// 本地开发环境
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`
╔═══════════════════════════════════════╗
║   微信公众号封面下载器服务已启动      ║
╚═══════════════════════════════════════╝

🚀 服务地址: http://localhost:${PORT}
📱 打开浏览器访问上述地址即可使用

按 Ctrl+C 停止服务
        `);
    });
}
