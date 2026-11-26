import redirects from './pageRedirects.json';

// 按来源和完整路径匹配；不能从任意站点的日期或文章标题猜测 Issue 编号。
const redirectsByOrigin: Readonly<Record<string, Readonly<Record<string, string>>>> = redirects;

/** 返回统计行的网页链接，保留查询参数和锚点；不把相对路径或非网页标识当成可点击地址。 */
export function resolvePageHref(source: string | null): string | null {
	if (!source || !/^https?:\/\//i.test(source)) return null;

	let url: URL;
	try {
		url = new URL(source);
	} catch {
		return null;
	}
	if (url.username || url.password) return null;

	const paths = redirectsByOrigin[url.origin];
	if (!paths) return source;
	try {
		// decodeURI 兼容中文和百分号编码，同时不会把 %2F 当作路径分隔符。
		const target = paths[decodeURI(url.pathname).replace(/\/$/, '')];
		if (target) {
			url.pathname = target;
			return url.href;
		}
	} catch {
		// 不能解码的历史路径仍按原地址展示，不猜测目标。
	}
	return source;
}
