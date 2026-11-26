/**
 * CWDComments 主类
 * 使用 Shadow DOM 隔离样式
 */

import { createApiClient } from './api.js';
import { createCommentStore } from './store.js';
import { CommentForm } from '@/components/CommentForm.js';
import { CommentList } from '@/components/CommentList.js';
import { ImagePreview } from '@/components/ImagePreview.js';
import { loadEmotionGroups } from '@/utils/emotions.js';
import styles from '@/styles/main.css?inline';
import { locales } from '@/locales/index.js';

/**
 * CWDComments 评论组件主类
 */
export class CWDComments {
	/**
	 * @param {Object} config - 配置对象
	 * @param {string|HTMLElement} config.el - 挂载元素选择器或 DOM 元素
	 * @param {string} config.apiBaseUrl - API 基础地址
	 * @param {string} [config.postSlug] - 固定评论标识，缺省使用当前路径；迁移时可保留历史路径
	 * @param {string} [config.postTitle] - 固定文章标题，缺省使用 document.title
	 * @param {string} [config.postUrl] - 固定文章 URL，供通知、后台链接与 PV 关联使用；迁移时应保留历史 URL
	 * @param {'light'|'dark'} [config.theme] - 主题（可选）
	 * @param {number} [config.pageSize] - 每页评论数（可选，默认 20）
	 * @param {string|Object} [config.emotionJson] - 前端表情 JSON 文件链接，留空则不显示表情按钮
	 * @param {string} [config.turnstileSiteKey] - Cloudflare Turnstile site key（通常由后端自动下发）
	 * @param {boolean} [config.collapseForm] - 是否默认收起评论表单，点击「写评论」入口后再展开（默认 false）
	 * @param {boolean} [config.compactLikeBar] - 文章点赞条是否用紧凑单行样式，避免评论区顶部大片空白（默认 false）
	 *
	 * postSlug、postTitle、postUrl 未配置时才从当前页面推导，显式配置在主题更新时保持不变。
	 * avatarPrefix/adminEmail/adminBadge 通过 /api/config/comments 接口获取。
	 */
	constructor(config) {
		this.config = { ...config };
		// 单独保留调用方的显式配置，避免把自动推导的地址误当作固定标识。
		this._postConfig = {
			postSlug: config.postSlug,
			postTitle: config.postTitle,
			postUrl: config.postUrl,
		};
		this.emotionGroups = [];
		if (config.siteId) {
			this.config.siteId = config.siteId;
		}
		this._resolvePostConfig();
		this.hostElement = this._resolveElement(config.el);
		this.shadowRoot = null;
		this.mountPoint = null;
		this.commentForm = null;
		this.commentList = null;
		this.imagePreview = null;
		this.formContainer = null;
		// 折叠模式：入口按钮与当前的展开态（未开启折叠时 formExpanded 恒为 true，表单常显）
		this.formTrigger = null;
		this.formExpanded = this.config.collapseForm !== true;
		this.customStyleElement = null;
		this.store = null;
		this.unsubscribe = null;
		this.likeState = {
			count: 0,
			liked: false,
			loading: false,
		};
		this._likeButtonEl = null;
		this._likeCountEl = null;
		this._pvElement = null;

		this._mounted = false;
		
		this.localeData = locales['zh-CN'];
		this.t = this.t.bind(this);
	}

	/**
	 * 解析文章配置：显式标识保持稳定，未配置的字段继续跟随当前页面。
	 * @private
	 */
	_resolvePostConfig() {
		if (typeof window !== 'undefined') {
			this.config.postSlug = this._postConfig.postSlug || window.location.pathname;
			this.config.postUrl = this._postConfig.postUrl || window.location.origin + window.location.pathname;
		}
		if (typeof document !== 'undefined') {
			this.config.postTitle = this._postConfig.postTitle || document.title || this.config.postSlug;
		}
	}

	/**
	 * 翻译函数
	 */
	t(key, params = {}) {
		let text = this.localeData[key] || key;
		for (const [k, v] of Object.entries(params)) {
			text = text.replace(`{${k}}`, v);
		}
		return text;
	}

	/**
	 * 解析挂载元素
	 * @private
	 */
	_resolveElement(el) {
		if (typeof document === 'undefined') {
			return null;
		}
		if (!el) {
			return null;
		}
		if (typeof el === 'string') {
			const element = document.querySelector(el);
			if (!element || !(element instanceof HTMLElement)) {
				return null;
			}
			return element;
		}
		if (el instanceof HTMLElement) {
			return el;
		}
		return null;
	}

	async _loadServerConfig() {
		try {
			const base = this.config.apiBaseUrl;
			if (!base) {
				return {};
			}
			const apiBaseUrl = base.replace(/\/$/, '');
			const res = await fetch(`${apiBaseUrl}/api/config/comments`);
			if (!res.ok) {
				return {};
			}
			const data = await res.json();
			return {
				adminEmail: data.adminEmail || '',
				adminBadge: data.adminBadge || '',
				adminEnabled: !!data.adminEnabled,
				avatarPrefix: data.avatarPrefix || '',
				allowedDomains: Array.isArray(data.allowedDomains) ? data.allowedDomains : [],
				enableCommentLike: typeof data.enableCommentLike === 'boolean' ? data.enableCommentLike : true,
				enableArticleLike: typeof data.enableArticleLike === 'boolean' ? data.enableArticleLike : true,
				enableImageLightbox: typeof data.enableImageLightbox === 'boolean' ? data.enableImageLightbox : false,
				requireReview: !!data.requireReview,
				turnstileSiteKey: typeof data.turnstileSiteKey === 'string' ? data.turnstileSiteKey : '',
				commentPlaceholder:
					typeof data.commentPlaceholder === 'string' ? data.commentPlaceholder : undefined,
				widgetLanguage: typeof data.widgetLanguage === 'string' ? data.widgetLanguage : undefined,
				emotionJson: typeof data.emotionJson === 'string' ? data.emotionJson : undefined,
			};
		} catch (e) {
			return {};
		}
	}

	/**
	 * 挂载组件
	 */
	mount() {
		if (this._mounted) {
			return;
		}
		if (this.hostElement) {
			this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });
			const styleElement = document.createElement('style');
			if (typeof styles === 'string') {
				styleElement.textContent = styles;
			} else if (styles && typeof styles === 'object' && 'default' in styles) {
				styleElement.textContent = styles.default;
			}
			this.shadowRoot.appendChild(styleElement);
			this.mountPoint = document.createElement('div');
			this.mountPoint.className = 'cwd-comments-container';
			this.shadowRoot.appendChild(this.mountPoint);
			const theme = this.config.theme || 'light';
			this.mountPoint.setAttribute('data-theme', theme);
			// 紧凑点赞条（opt-in）：把「大爱心竖排 + 上下 30px 留白」收成一行小胶囊
			if (this.config.compactLikeBar === true) {
				this.mountPoint.classList.add('cwd-compact-like');
			}
			this._applyCustomCss();
		}

		(async () => {
			const serverConfig = await this._loadServerConfig();
			if (!this._mounted) {
				return;
			}

			// 检查域名限制
			if (serverConfig.allowedDomains && serverConfig.allowedDomains.length > 0 && typeof window !== 'undefined') {
				const currentHostname = window.location.hostname;
				const isAllowed = serverConfig.allowedDomains.some((domain) => {
					return currentHostname === domain || currentHostname.endsWith('.' + domain);
				});

				// 设置语言
				let lang = this.config.lang || serverConfig.widgetLanguage || 'auto';
				if (lang === 'auto' && typeof navigator !== 'undefined') {
					const browserLang = navigator.language || navigator.userLanguage;
					if (browserLang.toLowerCase().startsWith('en')) {
						lang = 'en-US';
					} else {
						lang = 'zh-CN';
					}
				}
				if (locales[lang]) {
					this.localeData = locales[lang];
				}

				if (!isAllowed) {
					if (this.mountPoint) {
						this.mountPoint.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #666; font-size: 14px; border: 1px solid #eee; border-radius: 8px; background: #f9f9f9;">
              ${this.t('domainUnauthorized', { domain: currentHostname })}
            </div>
          `;
					}
					return;
				}
			} else {
				// 即使没有域名限制，也需要设置语言
				let lang = this.config.lang || serverConfig.widgetLanguage || 'auto';
				if (lang === 'auto' && typeof navigator !== 'undefined') {
					const browserLang = navigator.language || navigator.userLanguage;
					if (browserLang.toLowerCase().startsWith('en')) {
						lang = 'en-US';
					} else {
						lang = 'zh-CN';
					}
				}
				if (locales[lang]) {
					this.localeData = locales[lang];
				}
			}

			if (serverConfig.avatarPrefix) {
				this.config.avatarPrefix = serverConfig.avatarPrefix;
			}
			if (serverConfig.adminEmail) {
				this.config.adminEmail = serverConfig.adminEmail;
			}
			if (serverConfig.adminEnabled) {
				this.config.adminBadge = serverConfig.adminBadge;
			}
			this.config.requireReview = !!serverConfig.requireReview;
			this.config.turnstileSiteKey = serverConfig.turnstileSiteKey || this.config.turnstileSiteKey || '';
			this.config.enableCommentLike = serverConfig.enableCommentLike;
			this.config.enableArticleLike = serverConfig.enableArticleLike;
			this.config.enableImageLightbox = serverConfig.enableImageLightbox;

			if (this.config.enableImageLightbox === true) {
				if (this.mountPoint && !this.imagePreview) {
					this.imagePreview = new ImagePreview(this.mountPoint);
					this.mountPoint.addEventListener('click', (e) => this._handleImageClick(e));
				}
			}

			this.config.commentPlaceholder =
				typeof serverConfig.commentPlaceholder === 'string'
					? serverConfig.commentPlaceholder
					: this.config.commentPlaceholder;
			const emotionSource =
				typeof serverConfig.emotionJson === 'string' && serverConfig.emotionJson.trim()
					? serverConfig.emotionJson
					: this.config.emotionJson;
			const emotionGroups = await loadEmotionGroups(emotionSource);
			if (!this._mounted) {
				return;
			}
			this.emotionGroups = emotionGroups;

			const api = createApiClient(this.config);
			this.api = api;
			if (this.hostElement && this.mountPoint) {
        this.store = createCommentStore(
          this.config,
          api.fetchComments.bind(api),
          api.submitComment.bind(api),
          typeof api.likeComment === 'function' ? api.likeComment.bind(api) : undefined,
        );

				this.unsubscribe = this.store.store.subscribe((state, prevState) => {
					this._onStateChange(state, prevState);
				});

				this._render();
				this.store.loadComments();
			}

			if (this.api && typeof this.api.trackVisit === 'function') {
				this.api.trackVisit();
			}

			if (this.api && typeof this.api.getPagePv === 'function') {
				this._fetchAndFillPv();
			}

			if (this.api && typeof this.api.getLikeStatus === 'function') {
				try {
					const likeResult = await this.api.getLikeStatus();
					const count = likeResult && typeof likeResult.totalLikes === 'number' ? likeResult.totalLikes : 0;
					const liked = !!(likeResult && likeResult.liked);
					this.likeState.count = count;
					this.likeState.liked = liked;
					if (this.store && typeof this.store.setLikeState === 'function') {
						this.store.setLikeState(count, liked);
					}
					this._updateLikeButton();
				} catch (e) {}
			}
		})();

		this._mounted = true;
	}

	/**
	 * 卸载组件
	 */
	unmount() {
		if (!this._mounted) {
			return;
		}

		// 销毁组件
		if (this.commentForm) {
			this.commentForm.destroy();
			this.commentForm = null;
		}

		if (this.commentList) {
			this.commentList.destroy();
			this.commentList = null;
		}

		if (this.imagePreview) {
			// imagePreview 没有 destroy 方法，但它挂载在 shadowRoot 下，会被自动移除
			this.imagePreview = null;
		}

		// 取消订阅
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}

		// 移除 Shadow DOM - 通过替换所有子节点
		if (this.hostElement) {
			// Shadow DOM 会在清空子节点时自动移除
			while (this.hostElement.firstChild) {
				this.hostElement.removeChild(this.hostElement.firstChild);
			}
		}

		this.shadowRoot = null;
		this.mountPoint = null;
		this.store = null;
		this._mounted = false;
	}

	/**
	 * 渲染组件
	 * @private
	 */
	_render() {
		if (!this.mountPoint) {
			return;
		}

		const state = this.store.store.getState();

		// 创建错误提示
		const existingError = this.mountPoint.querySelector('.cwd-error-inline');
		if (state.error) {
			if (!existingError) {
				const errorEl = document.createElement('div');
				errorEl.className = 'cwd-error-inline';
				errorEl.innerHTML = `
          <span>${state.error}</span>
          <button type="button" class="cwd-error-close" data-action="clear-error">✕</button>
        `;
				errorEl.querySelector('[data-action="clear-error"]').addEventListener('click', () => {
					this.store.clearError();
				});
				this.mountPoint.insertBefore(errorEl, this.mountPoint.firstChild);
			}
		} else if (existingError) {
			existingError.remove();
		}

		const existingSuccess = this.mountPoint.querySelector('.cwd-success-inline');
		if (state.successMessage) {
			if (!existingSuccess) {
				const successEl = document.createElement('div');
				successEl.className = 'cwd-success-inline';
				successEl.innerHTML = `
          <span>${state.successMessage}</span>
          <button type="button" class="cwd-error-close" data-action="clear-success">✕</button>
        `;
				successEl.querySelector('[data-action="clear-success"]').addEventListener('click', () => {
					this.store.clearSuccess();
				});
				this.mountPoint.insertBefore(successEl, this.mountPoint.firstChild);
			} else {
				const span = existingSuccess.querySelector('span');
				if (span) {
					span.textContent = state.successMessage;
				}
			}
		} else if (existingSuccess) {
			existingSuccess.remove();
		}

		// 创建头部点赞区域
		let header = this.mountPoint.querySelector('.cwd-comments-header');
		if (!header) {
			header = document.createElement('div');
			header.className = 'cwd-comments-header';
			const showArticleLike = this.config.enableArticleLike !== false;
			header.style.display = showArticleLike ? '' : 'none';
			header.innerHTML = `
				<div class="cwd-like">
          <button type="button" class="cwd-like-button" data-liked="false">
            <span class="cwd-like-icon-wrapper">
              <svg class="cwd-like-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21c-.4 0-.8-.1-1.1-.4L4.5 15C3 13.6 2 11.7 2 9.6 2 6.5 4.5 4 7.6 4c1.7 0 3.3.8 4.4 2.1C13.1 4.8 14.7 4 16.4 4 19.5 4 22 6.5 22 9.6c0 2.1-1 4-2.5 5.4l-6.4 5.6c-.3.3-.7.4-1.1.4z"></path>
              </svg>
            </span>
						<div>${this.t('likes', { count: '<span class="cwd-like-count">0</span>' })}</div>
          </button>
        </div>
      `;
			this.mountPoint.appendChild(header);
		}

		this._initLikeButton(header);

		// 折叠模式：在点赞区域与表单之间插入「写评论」入口
		if (!this.formTrigger) {
			this.formTrigger = document.createElement('button');
			this.formTrigger.type = 'button';
			this.formTrigger.className = 'cwd-form-trigger';
			this.formTrigger.setAttribute('aria-expanded', 'false');
			this.formTrigger.innerHTML = `
				<span class="cwd-form-trigger-icon" aria-hidden="true">
					<svg viewBox="0 0 16 16" width="16" height="16">
						<path fill="currentColor" d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"></path>
					</svg>
				</span>
				<span class="cwd-form-trigger-text">${this.t('writeComment')}</span>
				<span class="cwd-form-trigger-action">${this.t('writeCommentBtn')}</span>
			`;
			this.formTrigger.addEventListener('click', () => this._setFormExpanded(true));
		}

		if (!this.formContainer) {
			this.formContainer = document.createElement('div');
			this.mountPoint.appendChild(this.formContainer);
		}

		// 入口必须紧贴在表单容器之前（其后依次是评论数、评论列表）
		if (this.formTrigger.parentNode !== this.mountPoint || this.formTrigger.nextSibling !== this.formContainer) {
			this.mountPoint.insertBefore(this.formTrigger, this.formContainer);
		}

		// 创建评论表单（放在点赞区域下方，使用单独容器以保证顺序）
		if (!this.commentForm) {
			this.commentForm = new CommentForm(this.formContainer, {
				form: state.form,
				formErrors: state.formErrors,
				submitting: state.submitting,
				onSubmit: (_form, turnstileToken) => this._handleSubmit(turnstileToken),
				onFieldChange: (field, value) => this.store.updateFormField(field, value),
				adminEmail: this.config.adminEmail,
				onVerifyAdmin: (key) => this.api.verifyAdminKey(key),
				onCollapse: this.config.collapseForm === true ? () => this._setFormExpanded(false) : null,
				placeholder: this.config.commentPlaceholder,
				emotionGroups: this.emotionGroups,
				turnstileSiteKey: this.config.turnstileSiteKey,
				turnstileTheme: this.config.theme,
				t: this.t
			});
			this.commentForm.render();
		}

		// 创建评论数统计（放在主评论表单下方、评论列表上方）
		let countHeading = this.mountPoint.querySelector('.cwd-comments-count');
		if (!countHeading) {
			countHeading = document.createElement('h3');
			countHeading.className = 'cwd-comments-count';
			countHeading.innerHTML = `
          ${this.t('totalComments', { count: '<span class="cwd-comments-count-number">0</span>' })}
        `;
			if (this.formContainer && this.formContainer.parentNode === this.mountPoint) {
				this.mountPoint.insertBefore(countHeading, this.formContainer.nextSibling);
			} else {
				this.mountPoint.appendChild(countHeading);
			}
		}
		const countEl = this.mountPoint.querySelector('.cwd-comments-count-number');
		if (countEl) {
			countEl.textContent = state.pagination.totalCount;
		}

		// 创建评论列表
		if (!this.commentList) {
			const listContainer = document.createElement('div');
			this.mountPoint.appendChild(listContainer);

        this.commentList = new CommentList(listContainer, {
				comments: state.comments,
				loading: state.loading,
				error: null,
				currentPage: state.pagination.page,
				totalPages: this.store.getTotalPages(),
				replyingTo: state.replyingTo,
				replyContent: state.replyContent,
				replyError: state.replyError,
				submitting: state.submitting,
				currentUser: state.form,
				onUpdateUserInfo: (field, value) => this.store.updateFormField(field, value),
				// adminEmail 已移除，前端展示改用 isAdmin 字段
				adminBadge: this.config.adminBadge,
				enableCommentLike: this.config.enableCommentLike !== false,
				turnstileSiteKey: this.config.turnstileSiteKey,
				turnstileTheme: this.config.theme,
				onRetry: () => this.store.loadComments(),
				onReply: (commentId) => this.store.startReply(commentId),
				onSubmitReply: (commentId, turnstileToken) => this.store.submitReply(commentId, turnstileToken),
				onCancelReply: () => this.store.cancelReply(),
				onUpdateReplyContent: (content) => this.store.updateReplyContent(content),
				onClearReplyError: () => this.store.clearReplyError(),
          replyPlaceholder: this.config.commentPlaceholder,
				emotionGroups: this.emotionGroups,
				onPrevPage: () => {
					const currentState = this.store.store.getState();
					this.store.goToPage(currentState.pagination.page - 1);
				},
				onNextPage: () => {
					const currentState = this.store.store.getState();
					this.store.goToPage(currentState.pagination.page + 1);
				},
				onGoToPage: (page) => this.store.goToPage(page),
				onLikeComment: (commentId, isLike) => {
					if (this.store && typeof this.store.likeComment === 'function') {
						this.store.likeComment(commentId, isLike);
					}
				},
				t: this.t
			});
			this.commentList.render();
		}

		// 让折叠状态与 DOM 保持一致（幂等，重渲染时也安全）
		this._applyFormVisibility();
	}

	/**
	 * 应用评论表单的折叠状态：入口与表单互斥显示。
	 * 未开启 collapseForm 时，入口恒隐藏、表单恒显示（与旧版行为一致）。
	 * @private
	 */
	_applyFormVisibility() {
		const collapse = this.config.collapseForm === true;
		const showTrigger = collapse && !this.formExpanded;

		if (this.formTrigger) {
			this.formTrigger.style.display = showTrigger ? '' : 'none';
			this.formTrigger.setAttribute('aria-expanded', showTrigger ? 'false' : 'true');
		}
		if (this.formContainer) {
			this.formContainer.style.display = showTrigger ? 'none' : '';
		}
	}

	/**
	 * 展开 / 收起评论表单（仅在开启 collapseForm 时生效）。
	 * @param {boolean} expanded - true 展开，false 收起
	 * @private
	 */
	_setFormExpanded(expanded) {
		if (this.config.collapseForm !== true) {
			return;
		}
		const next = expanded === true;
		if (next === this.formExpanded) {
			return;
		}
		this.formExpanded = next;
		this._applyFormVisibility();

		if (next) {
			// 展开后直接把光标放进输入框
			const textarea = this.commentForm?.elements?.root?.querySelector('textarea');
			if (textarea && typeof textarea.focus === 'function') {
				textarea.focus();
			}
		}
	}

	/**
	 * 状态变化处理
	 * @private
	 */
	_onStateChange(state, prevState) {
		if (!this._mounted) {
			return;
		}

		// 根据回复状态显示/隐藏主评论表单
		if (this.commentForm?.elements?.root) {
			const formRoot = this.commentForm.elements.root;
			if (this.config.collapseForm === true) {
				// 折叠模式：整块表单由入口控制显隐，开始回复时先收起（避免留下一片空白）
				formRoot.style.display = '';
				if (state.replyingTo !== null) {
					this._setFormExpanded(false);
				}
			} else {
				formRoot.style.display = state.replyingTo !== null ? 'none' : '';
			}
		}

		// 更新评论表单
		if (this.commentForm) {
			this.commentForm.setProps({
				form: state.form,
				formErrors: state.formErrors,
				submitting: state.submitting,
				adminEmail: this.config.adminEmail,
				emotionGroups: this.emotionGroups,
				turnstileSiteKey: this.config.turnstileSiteKey,
				turnstileTheme: this.config.theme,
			});
		}

		// 更新错误提示
		const existingError = this.mountPoint?.querySelector('.cwd-error-inline');
		if (state.error) {
			if (!existingError) {
				const errorEl = document.createElement('div');
				errorEl.className = 'cwd-error-inline';
				errorEl.innerHTML = `
          <span>${state.error}</span>
          <button type="button" class="cwd-error-close" data-action="clear-error">✕</button>
        `;
				errorEl.querySelector('[data-action="clear-error"]').addEventListener('click', () => {
					this.store.clearError();
				});
				this.mountPoint?.insertBefore(errorEl, this.mountPoint.firstChild);
			}
		} else if (existingError) {
			existingError.remove();
		}

		const existingSuccess = this.mountPoint?.querySelector('.cwd-success-inline');
		if (state.successMessage) {
			if (!existingSuccess) {
				const successEl = document.createElement('div');
				successEl.className = 'cwd-success-inline';
				successEl.innerHTML = `
          <span>${state.successMessage}</span>
          <button type="button" class="cwd-error-close" data-action="clear-success">✕</button>
        `;
				successEl.querySelector('[data-action="clear-success"]').addEventListener('click', () => {
					this.store.clearSuccess();
				});
				this.mountPoint?.insertBefore(successEl, this.mountPoint.firstChild);
			} else {
				const span = existingSuccess.querySelector('span');
				if (span) {
					span.textContent = state.successMessage;
				}
			}
		} else if (existingSuccess) {
			existingSuccess.remove();
		}

		// 更新点赞和评论数统计
		const header = this.mountPoint?.querySelector('.cwd-comments-header');
		const countEl = this.mountPoint?.querySelector('.cwd-comments-count-number');
		if (countEl) {
			countEl.textContent = state.pagination.totalCount;
		}

		if (typeof state.likeCount === 'number' || typeof state.liked === 'boolean') {
			if (typeof state.likeCount === 'number') {
				this.likeState.count = state.likeCount;
			}
			if (typeof state.liked === 'boolean') {
				this.likeState.liked = state.liked;
			}
			if (header) {
				if (!this._likeButtonEl || !this._likeCountEl) {
					this._initLikeButton(header);
				}
				this._updateLikeButton();
			}
		}

		// 更新评论列表
		if (this.commentList) {
			this.commentList.setProps({
				comments: state.comments,
				loading: state.loading,
				currentPage: state.pagination.page,
				totalPages: this.store.getTotalPages(),
				replyingTo: state.replyingTo,
				replyContent: state.replyContent,
				replyError: state.replyError,
				submitting: state.submitting,
				currentUser: state.form,
				emotionGroups: this.emotionGroups,
				turnstileSiteKey: this.config.turnstileSiteKey,
				turnstileTheme: this.config.theme,
			});
		}

		const pageChanged =
			prevState &&
			prevState.pagination &&
			state &&
			state.pagination &&
			state.pagination.page !== prevState.pagination.page;

		if (pageChanged) {
			this._scrollToCommentsTop();
		}
	}

	/**
	 * 处理评论提交
	 * @private
	 */
	async _handleSubmit(turnstileToken) {
		const result = await this.store.submitNewComment(turnstileToken);
		if (result.success) {
			// 表单内容已在 store 中清空
			// 更新表单组件
			if (this.commentForm) {
				this.commentForm.state.localForm = { ...this.store.store.getState().form };
				this.commentForm.state.showPreview = false;
				this.commentForm.render();
			}
			// 折叠模式：提交成功后自动收起，回到「写评论」入口态
			this._setFormExpanded(false);
		}
		return result;
	}

	/**
	 * 更新配置
	 * @param {Object} newConfig - 新配置
	 */
	updateConfig(newConfig) {
		const prevConfig = { ...this.config };

		Object.assign(this.config, newConfig);
		if (newConfig.siteId !== undefined) {
			this.config.siteId = newConfig.siteId;
		}
		for (const key of ['postSlug', 'postTitle', 'postUrl']) {
			if (Object.prototype.hasOwnProperty.call(newConfig, key)) {
				this._postConfig[key] = newConfig[key];
			}
		}
		this._resolvePostConfig();

		// 更新主题
		if (newConfig.theme && this.mountPoint) {
			this.mountPoint.setAttribute('data-theme', newConfig.theme);
			this.commentForm?.setProps({ turnstileTheme: newConfig.theme });
			this.commentList?.setProps({ turnstileTheme: newConfig.theme });
		}

		// 运行时切换「表单是否折叠」（初始化之后一般不会再改）
		if (newConfig.collapseForm !== undefined && newConfig.collapseForm !== prevConfig.collapseForm) {
			this.formExpanded = newConfig.collapseForm !== true;
			if (this.commentForm) {
				this.commentForm.setProps({
					onCollapse: newConfig.collapseForm === true ? () => this._setFormExpanded(false) : null,
				});
				this.commentForm.render();
			}
			this._applyFormVisibility();
		}

		// 运行时切换「点赞条是否紧凑」（初始化之后一般不会再改）
		if (newConfig.compactLikeBar !== undefined && this.mountPoint) {
			this.mountPoint.classList.toggle('cwd-compact-like', newConfig.compactLikeBar === true);
		}

		const shouldReload =
			this.config.apiBaseUrl !== prevConfig.apiBaseUrl ||
			this.config.pageSize !== prevConfig.pageSize ||
			this.config.postSlug !== prevConfig.postSlug ||
			this.config.siteId !== prevConfig.siteId;

		if (shouldReload) {
			const api = createApiClient(this.config);
			this.api = api;

			if (this.unsubscribe) {
				this.unsubscribe();
			}

			this.store = createCommentStore(this.config, api.fetchComments.bind(api), api.submitComment.bind(api));

			this.unsubscribe = this.store.store.subscribe((state, prevState) => {
				this._onStateChange(state, prevState);
			});

			this.store.loadComments();
		}
		this._applyCustomCss();
	}

	_scrollToCommentsTop() {
		if (typeof window === 'undefined') {
			return;
		}
		const target = this.hostElement || this.mountPoint;
		if (!target || typeof target.scrollIntoView !== 'function') {
			return;
		}
		target.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	_applyCustomCss() {
		if (!this.shadowRoot) {
			return;
		}
		const rawUrl = this.config && typeof this.config.customCssUrl === 'string' ? this.config.customCssUrl : '';
		const url = rawUrl.trim();
		if (!url) {
			if (this.customStyleElement && this.customStyleElement.parentNode) {
				this.customStyleElement.parentNode.removeChild(this.customStyleElement);
			}
			this.customStyleElement = null;
			return;
		}
		if (!this.customStyleElement) {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = url;
			this.shadowRoot.appendChild(link);
			this.customStyleElement = link;
			return;
		}
		this.customStyleElement.href = url;
		if (this.customStyleElement.parentNode !== this.shadowRoot) {
			this.shadowRoot.appendChild(this.customStyleElement);
		}
	}

	_initLikeButton(header) {
		if (!header) {
			return;
		}
		if (!this._likeButtonEl) {
			this._likeButtonEl = header.querySelector('.cwd-like-button');
			if (this._likeButtonEl) {
				this._likeButtonEl.addEventListener('click', () => {
					this._handleLikeClick();
				});
			}
		}
		if (!this._likeCountEl) {
			this._likeCountEl = header.querySelector('.cwd-like-count');
		}
		this._updateLikeButton();
	}

	_updateLikeButton(animate = false) {
		if (!this._likeButtonEl) {
			if (!this.mountPoint) {
				return;
			}
			const header = this.mountPoint.querySelector('.cwd-comments-header');
			if (!header) {
				return;
			}
			this._initLikeButton(header);
		}
		if (!this._likeButtonEl) {
			return;
		}
		const state = this.store?.store?.getState();
		const liked = state ? !!state.liked : this.likeState.liked;
		const count = state && typeof state.likeCount === 'number' ? state.likeCount : this.likeState.count;
		this.likeState.count = count;
		this.likeState.liked = liked;
		this._likeButtonEl.dataset.liked = liked ? 'true' : 'false';
		this._likeButtonEl.dataset.loading = this.likeState.loading ? 'true' : 'false';
		if (this._likeCountEl) {
			this._likeCountEl.textContent = String(count);
		}
		if (animate && this._likeButtonEl) {
			this._likeButtonEl.classList.remove('cwd-like-animate');
			void this._likeButtonEl.offsetWidth;
			this._likeButtonEl.classList.add('cwd-like-animate');
		}
	}

	_handleLikeClick() {
		if (!this.api || typeof this.api.likePage !== 'function') {
			return;
		}
		if (this.likeState.loading) {
			return;
		}
		const currentState = this.store?.store?.getState();
		const currentCount = currentState && typeof currentState.likeCount === 'number' ? currentState.likeCount : this.likeState.count;
		const wasLiked = currentState ? !!currentState.liked : this.likeState.liked;
		if (wasLiked) {
			return;
		}
		const nextCount = currentCount + 1;
		this.likeState.loading = true;
		this.likeState.count = nextCount;
		this.likeState.liked = true;
		if (this.store && typeof this.store.setLikeState === 'function') {
			this.store.setLikeState(nextCount, true);
		}
		this._updateLikeButton(true);
		this.api
			.likePage()
			.then((result) => {
				const total = result && typeof result.totalLikes === 'number' ? result.totalLikes : nextCount;
				const liked = !!(result && result.liked);
				this.likeState.count = total;
				this.likeState.liked = liked;
				if (this.store && typeof this.store.setLikeState === 'function') {
					this.store.setLikeState(total, liked);
				}
				this._updateLikeButton();
			})
			.catch(() => {
				this.likeState.count = currentCount;
				this.likeState.liked = wasLiked;
				if (this.store && typeof this.store.setLikeState === 'function') {
					this.store.setLikeState(currentCount, wasLiked);
				}
				this._updateLikeButton();
			})
			.finally(() => {
				this.likeState.loading = false;
				this._updateLikeButton();
			});
	}

	/**
	 * 处理图片点击
	 * @private
	 */
	_handleImageClick(e) {
		const target = e.target;
		// 检查点击的是否是评论内容中的图片
		if (target.tagName === 'IMG' && target.closest('.cwd-comment-content')) {
			e.preventDefault();
			e.stopPropagation();
			if (this.imagePreview) {
				this.imagePreview.open(target.src);
			}
		}
	}

	/**
	 * 获取当前配置
	 * @returns {Object}
	 */
	getConfig() {
		return { ...this.config };
	}

	/**
	 * 获取并填充页面访问量
	 * @private
	 */
	async _fetchAndFillPv() {
		try {
			// 查找固定 ID 的容器
			const container = typeof document !== 'undefined'
				? document.querySelector('#cwd-page-pv')
				: null;

			if (!container) {
				return;  // 容器不存在则静默跳过
			}

			this._pvElement = container;
			const result = await this.api.getPagePv();
			const pv = result && typeof result.pv === 'number' ? result.pv : 0;
			this._updatePvDisplay(pv);
		} catch (e) {
			// 静默失败，不影响主功能
		}
	}

	/**
	 * 更新 PV 显示
	 * @private
	 */
	_updatePvDisplay(pv) {
		if (!this._pvElement) return;
		this._pvElement.textContent = this._formatPvNumber(pv);
		this._pvElement.setAttribute('data-cwd-pv', String(pv));
	}

	/**
	 * 格式化 PV 数字
	 * @private
	 */
	_formatPvNumber(num) {
		if (num >= 1000000) {
			return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
		}
		if (num >= 1000) {
			return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
		}
		return String(num);
	}
}
