import redirects from './pageRedirects.json';

// 按来源和完整路径匹配；不能从任意站点的日期或文章标题猜测 Issue 编号。
const redirectsByOrigin: Readonly<Record<string, Readonly<Record<string, string>>>> = redirects;
const canonicalBlogOrigin = 'https://raclen.top';
const blogSiteId = 'raclen.qzz.io';
// 历史记录可能使用博客曾用域名；只有命中旧路径映射时才切换到主站。
const legacyBlogOrigins = new Set([`https://${blogSiteId}`, 'https://raclen.ee.cd', 'https://raclen.cyou']);

/** 返回后台列表的网页链接。只有确认属于博客的相对路径才尝试匹配旧地址映射。 */
export function resolvePageHref(source: string | null, siteId?: string): string | null {
	if (!source) return null;
	const isRelative = siteId === blogSiteId && /^\/blog\/[^/\\?#]+\/?(?:[?#]|$)/.test(source);
	if (!isRelative && !/^https?:\/\//i.test(source)) return null;

	let url: URL;
	try {
		url = new URL(source, isRelative ? canonicalBlogOrigin : undefined);
	} catch {
		return null;
	}
	if (url.username || url.password) return null;

	const origin = legacyBlogOrigins.has(url.origin) ? canonicalBlogOrigin : url.origin;
	const paths = redirectsByOrigin[origin];
	try {
		// decodeURI 兼容中文和百分号编码，同时不会把 %2F 当作路径分隔符。
		const key = decodeURI(url.pathname).replace(/\/$/, '');
		const target = paths?.[key];
		if (target) {
			const shortUrl = new URL(target, origin);
			shortUrl.search = url.search;
			shortUrl.hash = url.hash;
			return shortUrl.href;
		}
		if (isRelative && /^\/blog\/[1-9]\d*\/?$/.test(url.pathname)) {
			url.pathname = `${key}/`;
			return url.href;
		}
	} catch {
		// 不能解码的历史路径不猜测目标。
	}
	return isRelative ? null : source;
}
