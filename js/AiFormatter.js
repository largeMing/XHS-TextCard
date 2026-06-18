/**
 * AiFormatter - AI 智能排版模块
 *
 * 使用 OpenAI 兼容 API 格式，支持 Claude、OpenAI、DeepSeek 等任意提供商。
 * API 配置存储在 localStorage，无需后端。
 */
class AiFormatter {
    static STORAGE_KEY = 'xhs_ai_config';

    static SYSTEM_PROMPT = `你是一位专业的小红书内容排版师。用户会给你一段原始文案，你需要将其整理成适合小红书的 Markdown 格式。

排版规则：
1. 用 # ## ### 建立清晰的层级标题，标题可适当加 emoji 增加视觉吸引力
2. **加粗**重要观点和关键词，==高亮==最核心的概念
3. 段落之间保留空行，每段控制在 3-4 行以内，便于阅读
4. 并列信息使用 - 无序列表，步骤类信息使用 1. 2. 3. 有序列表
5. 引用金句或重要提示时用 > 引用块
6. 保留原文的核心观点和数据，不添加、不编造内容
7. 输出纯 Markdown 文本，不加任何解释、前言或注释

直接输出排版后的 Markdown，不要说"好的"、"以下是"等任何前缀。`;

    constructor() {
        this.config = this._loadConfig();
    }

    _loadConfig() {
        try {
            const raw = localStorage.getItem(AiFormatter.STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    saveConfig(baseUrl, apiKey, model, apiFormat) {
        const config = {
            baseUrl: (baseUrl || '').trim().replace(/\/$/, ''),
            apiKey: (apiKey || '').trim(),
            model: (model || '').trim(),
            apiFormat: apiFormat === 'anthropic' ? 'anthropic' : 'openai'
        };
        try {
            localStorage.setItem(AiFormatter.STORAGE_KEY, JSON.stringify(config));
        } catch (e) {
            console.warn('[AiFormatter] Failed to save config');
        }
        this.config = config;
    }

    isConfigured() {
        return !!(this.config.baseUrl && this.config.apiKey && this.config.model);
    }

    getConfig() {
        return { ...this.config };
    }

    async format(text) {
        if (!this.isConfigured()) {
            throw new Error('API 未配置，请先填写 API 地址、Key 和模型名称');
        }

        return this.config.apiFormat === 'anthropic'
            ? this._formatWithAnthropic(text)
            : this._formatWithOpenAI(text);
    }

    async _formatWithAnthropic(text) {
        const { baseUrl, apiKey, model } = this.config;
        const endpoint = `${baseUrl}/messages`;

        const body = JSON.stringify({
            model,
            max_tokens: 4096,
            thinking: { type: 'disabled' },
            system: AiFormatter.SYSTEM_PROMPT,
            messages: [{ role: 'user', content: text }]
        });

        let response;
        try {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'Authorization': `Bearer ${apiKey}`,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body
            });
        } catch (networkErr) {
            throw new Error(`网络请求失败，请检查 API 地址是否正确：${networkErr.message}`);
        }

        if (!response.ok) {
            let errMsg = `HTTP ${response.status}`;
            try {
                const errBody = await response.json();
                errMsg = errBody?.error?.message || errMsg;
            } catch (_) {}
            throw new Error(`API 返回错误：${errMsg}`);
        }

        let data;
        try {
            data = await response.json();
        } catch (parseErr) {
            throw new Error('API 响应解析失败，请确认返回格式是否为 JSON');
        }

        const textBlock = data?.content?.find(b => b.type === 'text');
        const content = textBlock?.text;
        if (!content || !content.trim()) {
            throw new Error('AI 返回内容为空，请检查模型配置或重试');
        }

        return content.trim();
    }

    async _formatWithOpenAI(text) {
        const { baseUrl, apiKey, model } = this.config;
        const endpoint = `${baseUrl}/chat/completions`;

        const body = JSON.stringify({
            model,
            messages: [
                { role: 'system', content: AiFormatter.SYSTEM_PROMPT },
                { role: 'user', content: text }
            ],
            stream: false,
            temperature: 0.7,
            max_tokens: 4096
        });

        let response;
        try {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body
            });
        } catch (networkErr) {
            throw new Error(`网络请求失败，请检查 API 地址是否正确：${networkErr.message}`);
        }

        if (!response.ok) {
            let errMsg = `HTTP ${response.status}`;
            try {
                const errBody = await response.json();
                errMsg = errBody?.error?.message || errBody?.message || errMsg;
            } catch (_) {}
            throw new Error(`API 返回错误：${errMsg}`);
        }

        let data;
        try {
            data = await response.json();
        } catch (parseErr) {
            throw new Error('API 响应解析失败，请确认返回格式是否为 JSON');
        }

        const content = data?.choices?.[0]?.message?.content;
        if (!content || !content.trim()) {
            throw new Error('AI 返回内容为空，请检查模型配置或重试');
        }

        return content.trim();
    }
}
