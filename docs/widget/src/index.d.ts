export interface CWDCommentsConfig {
  /**
   * Selector or DOM element to mount the widget
   */
  el: string | HTMLElement;
  
  /**
   * Base URL of the CWD Comments API
   */
  apiBaseUrl: string;
  
  /**
   * Site ID for multi-site support
   */
  siteId?: string;
  
  /**
   * 固定评论标识，默认使用 window.location.pathname。
   * URL 迁移时可继续传原路径，更新主题不会重置；传空字符串可恢复自动推导。
   */
  postSlug?: string;

  /**
   * 固定文章标题，默认使用 document.title；显式传入时更新主题不会覆盖。
   */
  postTitle?: string;

  /**
   * 固定文章 URL，默认使用 window.location.origin + window.location.pathname。
   * 通知、后台链接与 PV 依赖此 URL，迁移时保留原值才能沿用历史统计；更新主题不会覆盖。
   * 传空字符串可恢复自动推导，查询参数与 hash 不参与默认 URL。
   */
  postUrl?: string;
  
  /**
   * Widget theme
   * @default 'light'
   */
  theme?: 'light' | 'dark' | string;
  
  /**
   * Comments per page
   * @default 20
   */
  pageSize?: number;
  
  /**
   * Widget language
   * @default 'auto'
   */
  lang?: 'zh-CN' | 'en-US' | 'auto' | string;
  
  /**
   * Custom CSS URL to load
   */
  customCssUrl?: string;

  /**
   * Enable/Disable comment likes
   */
  enableCommentLike?: boolean;

  /**
   * Use a compact single-row style for the post like bar (removes the large blank
   * area above the comment area)
   * @default false
   */
  compactLikeBar?: boolean;

  /**
   * Enable/Disable article likes
   */
  enableArticleLike?: boolean;

  /**
   * Enable/Disable image lightbox
   */
  enableImageLightbox?: boolean;

  /**
   * Placeholder text for comment input
   */
  commentPlaceholder?: string;

  /**
   * Custom OwO emotion JSON for the emotion picker. Empty values hide the emotion button.
   */
  emotionJson?: string | Record<string, unknown>;

  /**
   * Cloudflare Turnstile site key. Normally loaded from the CWD API.
   */
  turnstileSiteKey?: string;
}

export class CWDComments {
  constructor(config: CWDCommentsConfig);
  
  /**
   * Mount the widget to the DOM
   */
  mount(): void;
  
  /**
   * Unmount the widget and clean up
   */
  unmount(): void;
  
  /**
   * Update widget configuration
   * @param newConfig Partial configuration to update
   */
  updateConfig(newConfig: Partial<CWDCommentsConfig>): void;
  
  /**
   * Get current configuration
   */
  getConfig(): CWDCommentsConfig;
}

export default CWDComments;
