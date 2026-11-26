import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiClient } from './api.js';

test('submitComment exposes whether Turnstile was consumed', async (t) => {
	const originalFetch = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = originalFetch;
	});

	globalThis.fetch = async () =>
		new Response(
			JSON.stringify({
				message: '评论频繁，等10s后再试',
				turnstileConsumed: false,
			}),
			{ status: 429, statusText: 'Too Many Requests' }
		);

	const api = createApiClient({
		apiBaseUrl: 'https://comments.example.com',
		postSlug: '/post',
	});

	await assert.rejects(
		api.submitComment({
			name: 'Reader',
			email: 'reader@example.com',
			content: 'hello',
			turnstileToken: 'token',
		}),
		(error) => {
			assert.equal(error.status, 429);
			assert.equal(error.turnstileConsumed, false);
			return true;
		}
	);
});

test('旧文章路径继续关联评论、点赞与阅读量', async (t) => {
	const originalFetch = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = originalFetch;
	});
	const requests = [];
	globalThis.fetch = async (url, options = {}) => {
		requests.push({ url: new URL(url), body: options.body ? JSON.parse(options.body) : undefined });
		return new Response('{}', { status: 200 });
	};

	const legacyPath = new URL('/blog/2026-11-22-200-旧文章标题/', 'https://example.com').pathname;
	const legacyUrl = 'https://example.com' + legacyPath;
	const api = createApiClient({
		apiBaseUrl: 'https://comments.example.com',
		siteId: 'blog',
		postSlug: legacyPath,
		postUrl: legacyUrl,
		postTitle: '文章标题',
	});

	await api.fetchComments();
	await api.submitComment({ name: '读者', email: '', content: '迁移后的新评论' });
	await api.getLikeStatus();
	await api.likePage();
	await api.trackVisit();
	await api.getPagePv();

	assert.equal(requests[0].url.searchParams.get('post_slug'), legacyPath);
	assert.equal(requests[0].url.searchParams.get('site_id'), 'blog');
	assert.equal(requests[1].body.post_slug, legacyPath);
	assert.equal(requests[1].body.post_url, legacyUrl);
	assert.equal(requests[1].body.site_id, 'blog');
	assert.equal(requests[2].url.searchParams.get('post_slug'), requests[3].body.postSlug);
	assert.equal(requests[3].body.postSlug, legacyPath);
	assert.equal(requests[3].body.postUrl, legacyUrl);
	assert.equal(requests[4].body.postSlug, legacyUrl);
	assert.equal(requests[4].body.siteId, 'blog');
	assert.equal(requests[5].url.searchParams.get('post_slug'), legacyUrl);
	assert.equal(requests[5].url.searchParams.get('siteId'), 'blog');
});

test('没有 postUrl 时点赞和 PV 均回退到文章标识', async (t) => {
	const originalFetch = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = originalFetch;
	});
	const requests = [];
	globalThis.fetch = async (url, options = {}) => {
		requests.push({ url: new URL(url), body: options.body ? JSON.parse(options.body) : undefined });
		return new Response('{}', { status: 200 });
	};
	const api = createApiClient({ apiBaseUrl: 'https://comments.example.com', postSlug: '/blog/200/' });

	await api.getLikeStatus();
	await api.likePage();
	await api.trackVisit();
	await api.getPagePv();

	assert.equal(requests[0].url.searchParams.get('post_slug'), '/blog/200/');
	assert.equal(requests[1].body.postSlug, '/blog/200/');
	assert.equal(requests[2].body.postSlug, '/blog/200/');
	assert.equal(requests[3].url.searchParams.get('post_slug'), '/blog/200/');
});
