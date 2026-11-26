# 前端配置

**这里仅提供一套开箱即用的方案，如果是个人开发者可以根据 [API 文档](../api/overview) 自行编写前端评论组件。**

组件源码目录：`/docs/widget`

## 组件特性

CWD 评论组件采用 **Shadow DOM** 技术构建，基于独立根节点渲染，具备以下优势：

- **样式隔离**：组件样式完全独立，不会与宿主页面的样式产生冲突
- **DOM 隔离**：组件内部 DOM 结构与外部页面完全隔离，互不干扰
- **即插即用**：无需担心现有网站的样式框架（如 Bootstrap、Tailwind 等）影响组件显示
- **自定义样式**：通过 `customCssUrl` 参数注入自定义样式表，灵活调整外观

## 评论组件初始化

在初始化 `CWDComments` 实例时，可以传入以下配置参数：

建议使用 cdn 锁版本，防止组件版本升级导致的兼容性问题，更新时只需要修改版本号即可。

```html
<div id="comments"></div>
<script src="https://unpkg.com/cwd-widget@0.0.x/dist/cwd.js"></script>
<!-- <script src="https://cdn.jsdelivr.net/npm/cwd-widget@0.0.x/dist/cwd.js"></script> -->

<script>
	const comments = new CWDComments({
		el: '#comments', // 必填
		apiBaseUrl: 'https://your-api.example.com', // 必填，换成你的 API 地址
		postSlug: 'post-unique-id-001', // 选填，自定义评论标识符，用于跨路径/多语言聚合
		siteId: 'blog', // 选填，推荐配置，用于多站点数据隔离
		lang: 'auto', // 选填，评论组件语言，详见下方说明
	});
	comments.mount();
</script>
```

如果你的站点是多语言结构（例如 `/en/post/1` 和 `/zh/post/1`），或者是不同路径需要共享同一份评论数据，可以通过 `postSlug` 参数手动指定唯一的标识符；

如果未指定 `postSlug`，组件将默认使用 `window.location.pathname` 作为标识符。

**cdn 链接（推荐使用）：请单独修改版本号** 

```
https://unpkg.com/cwd-widget@0.0.x/dist/cwd.js
https://cdn.jsdelivr.net/npm/cwd-widget@0.0.x/dist/cwd.js
```

*最新版本链接（不建议使用）*
```
https://cwd.js.org/cwd.js
```

### 参数说明

| 参数           | 类型                    | 必填 | 默认值                     | 说明                                     |
| -------------- | ----------------------- | ---- | -------------------------- | ---------------------------------------- |
| `el`           | `string \| HTMLElement` | 是   | -                          | 挂载元素选择器或 DOM 元素                |
| `apiBaseUrl`   | `string`                | 是   | -                          | API 基础地址                             |
| `siteId`       | `string`                | 否   | `''`                       | 站点 ID，用于多站点数据隔离，推荐配置    |
| `postSlug`     | `string`                | 否   | `window.location.pathname` | 自定义评论标识符，用于跨路径/多语言聚合  |
| `postUrl`      | `string`                | 否   | `window.location.origin + window.location.pathname` | 固定文章 URL，用于通知、后台链接与 PV 关联 |
| `postTitle`    | `string`                | 否   | `document.title`           | 自定义文章标题，供后台和通知显示         |
| `lang`         | `string`                | 否   | `auto`                     | 评论组件语言代码，支持 `zh-CN`、`en-US`、`fr` 等，`auto` 表示自动根据浏览器语言选择 |
| `theme`        | `'light' \| 'dark'`     | 否   | `'light'`                  | 主题模式                                 |
| `pageSize`     | `number`                | 否   | `20`                       | 每页显示评论数                           |
| `customCssUrl` | `string`                | 否   | -                          | 自定义样式表 URL，追加到 Shadow DOM 底部 |
| `turnstileSiteKey` | `string`             | 否   | 后端配置                   | Cloudflare Turnstile 站点密钥，通常无需手动传入 |

配置后端 `TURNSTILE_SITE_KEY` 和 `TURNSTILE_SECRET_KEY` 后，组件会从 `/api/config/comments` 自动读取站点密钥，并在新评论和回复提交前要求完成人机验证，密钥的申请方式见[人机验证 Turnstile](/guide/turnstile)。

### 文章 URL 迁移与历史数据兼容

评论以 `siteId` 和 `postSlug` 关联，文章点赞沿用 `postSlug`，PV 使用 `postUrl`（未提供时回退到 `postSlug`）。把日期/标题长链接改成 `/blog/200/` 等短链接时，仅配置 `postSlug` 不能保留全部历史统计。

历史文章可以继续使用原来的存储标识，无需直接修改 D1 数据：

```javascript
const legacyPath = new URL('/blog/2026-11-22-200-旧文章标题/', 'https://example.com').pathname;
const comments = new CWDComments({
	el: '#comments',
	apiBaseUrl: 'https://comments.example.com',
	siteId: 'blog', // 必须与迁移前一致
	postSlug: legacyPath, // 保留历史评论路径及原有的编码、末尾斜杠格式
	postUrl: 'https://example.com' + legacyPath, // 保留历史 PV 使用的域名与路径
});
comments.mount();
```

- 浏览器地址仍使用新的短链接；`postSlug`、`postUrl` 只是 CWD 的关联标识，不会修改浏览器地址。
- 示例中的路径、域名、`siteId` 必须替换为实际历史值，不能直接改成新的编号标识，否则会创建独立的数据关联。
- 博客需要继续维护旧链接到新链接的 301 重定向，因为后台和通知仍可能引用历史 URL。
- 显式传入的 `postSlug`、`postUrl`、`postTitle` 在 `updateConfig({ theme: 'dark' })` 等无关更新时保持不变，不需要修改实例内部的 `config`。
- 未传入的字段继续自动推导；给字段传入空字符串可恢复自动推导。单页应用切换文章时，应传入新文章对应的标识，或卸载后重新初始化实例。
- 新发表且没有历史数据的文章可直接采用编号路径。不要删除历史映射；关闭或删除文章后如需恢复原评论，也需要原映射。

此修改位于 Widget 源码。自托管的博客必须更新构建后的 `cwd.js` 才能使用；只部署评论 API 或只修改此仓库源码不会更新博客中已经复制的组件文件。旧版 Widget 会覆盖 `postUrl`，不能直接套用以上配置。

### 多语言配置说明

评论组件语言的优先级如下：

1. 前端实例化时传入的 `lang` 参数（最高优先级）
2. 后端在「功能设置」中配置的 `widgetLanguage`（通过 `/admin/settings/features` 接口下发）
3. 浏览器语言自动检测（当以上两项都为空或为 `auto` 时生效）

推荐做法：

- 后端在管理后台中设置一个全局默认语言（`widgetLanguage`），例如 `zh-CN`
- 不同语言站点如有特殊需求，再在前端实例化时通过 `lang` 明确指定

> [!note] 目前支持的语言有：
> `zh-CN` `en-US` `zh-TW` `es` `pt` `fr` `de` `ja` `ko` `ru` `it` `nl` `ar` `hi` `id`

如需适配其他语言，请联系我们，我们会在后续版本中添加对其他语言的支持，或者提交 pr。

头像前缀、博主邮箱和标识等信息由后端接口 `/api/config/comments` 提供，无需在前端进行配置。

当 `/admin/settings/comments` 中配置了“评论博主邮箱”（`adminEmail`）时：

- 前台组件会将该邮箱视为“管理员邮箱”；
- 使用该邮箱发表评论时，会在邮箱输入框失焦后触发“管理员身份验证”弹窗；
- 验证通过后，会在浏览器本地保存一次管理员密钥（仅用于本机后续请求携带 `adminToken`）；
- 后端会在 `/api/comments` 中校验此密钥，确保管理员身份的评论需要额外验证；
- 后端邮件通知会将新评论提醒发送到该邮箱，无需再单独配置通知收件人。

## 实例方法

| 方法                   | 说明                           |
| ---------------------- | ------------------------------ |
| `mount()`              | 挂载组件到 DOM                 |
| `unmount()`            | 卸载组件                       |
| `updateConfig(config)` | 更新配置（支持动态切换主题等） |
| `getConfig()`          | 获取当前配置                   |

**使用示例**

```javascript
// 动态切换主题
comments.updateConfig({ theme: 'dark' });

// 动态修改评论标识符（适用于单页应用路由切换）
comments.updateConfig({ postSlug: '/new-post-slug' });

// 配置自定义样式（会以 <link> 形式注入到 Shadow DOM 底部）
comments.updateConfig({
	customCssUrl: 'https://your-cdn.example.com/cwd-custom.css',
});
```

## 其他框架示例

如果你有其他博客框架的需求，欢迎在下方评论区留言。

### HTML

此方法适用于绝大多数博客框架，包括 Hexo、Hugo、Jekyll、WordPress 等。

```html
<div id="comments"></div>
<script src="https://unpkg.com/cwd-widget@0.0.x/dist/cwd.js"></script>

<!-- 实例调用 -->
<script>
	const comments = new CWDComments({
		el: '#comments',
		apiBaseUrl: 'https://your-api.example.com', // 换成你的 API 地址
	});
	comments.mount();

	// 或者
	// document.addEventListener('DOMContentLoaded', () => {
	// 	const comments = new window.CWDComments({
	// 		el: '#comments',
	// 		apiBaseUrl: 'https://your-api.example.com',
	// 	});
	// 	comments.mount();
	// });
</script>
```

### Astro

```astro
<div id="comments"></div>
<script src="https://unpkg.com/cwd-widget@0.0.x/dist/cwd.js" is:inline></script>

<script is:inline>
  document.addEventListener('DOMContentLoaded', () => {
    const comments = new window.CWDComments({
      el: '#comments',
      apiBaseUrl: 'https://your-api.example.com', // 换成你的 API 地址
    });
    comments.mount();
  });
</script>
```

### Vue3

安装 `npm i cwd-widget`

```html
<div id="comments"></div>
```

```js
import CWDComments from "cwd-widget";

onMounted(() => {
	// 初始化评论组件
	const comments = new CWDComments({
		el: '#comments',
		apiBaseUrl: 'https://your-api.example.com',
	});
	comments.mount();
});
```

### Vue2

安装 `npm i cwd-widget`

```html
<div id="comments"></div>
```

```js
import CWDComments from "cwd-widget";

// 放在 mounted 钩子中初始化评论组件
mounted() {
	const comments = new CWDComments({
		el: "#comments",
		apiBaseUrl: "https://your-api.example.com",
	});
	comments.mount();
},
```

### React

安装 `npm i cwd-widget`

```js
import { useEffect, useRef } from "react";
import CWDComments, { CWDCommentsConfig } from "cwd-widget";

function Comments() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const config: CWDCommentsConfig = {
      el: containerRef.current,
      apiBaseUrl: "https://your-api.example.com",
    };

    const comments = new CWDComments(config);
    comments.mount();

    return () => {
      comments.unmount();
    };
  }, []);

  return <div id="comments" ref={containerRef} />;
}

export default Comments;
```