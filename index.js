import {
    characters,
    this_chid,
    eventSource,
    event_types,
    saveSettingsDebounced,
    generateQuietPrompt,
} from '../../../../script.js';

import { extension_settings } from '../../../extensions.js';

const MODULE_KEY = 'smart_memory_book';

const defaultSettings = {
    theme: 'sakura',
    interval: 10,
    injectIntoContext: true,
    apiUrl: '',
    apiKey: '',
    model: '',
    systemPrompt: `Ты — внешний аналитический модуль «Архивариус базы данных». Твоя единственная цель — сжатое обновление хроники ролевой игры. 
Ты НЕ являешься персонажем. Ты НЕ ведёшь диалог и НЕ подыгрываешь.
Изучи текущее состояние книги памяти и новые реплики чата, затем верни строго обновлённый JSON следующего формата:
{
  "plot": "Краткая хроника ключевых событий сюжета...",
  "user": "Факты, статус, экипировка, раскрытые секреты и психологическое состояние {{user}}...",
  "other": "Детали мира, статус NPC, важные предметы и обещания..."
}
Никаких вводных фраз, рассуждений или тегов markdown. Только чистый JSON.`,
    data: {
        plot: '',
        user: '',
        other: '',
    },
    messageCounter: 0,
};

function getSettings() {
    extension_settings[MODULE_KEY] = extension_settings[MODULE_KEY] || {};
    return Object.assign(defaultSettings, extension_settings[MODULE_KEY]);
}

function saveModuleSettings() {
    saveSettingsDebounced();
}

function makeDraggable(el) {
    let isDragging = false;
    let hasMoved = false;
    let startX, startY, origX, origY;

    el.addEventListener('mousedown', (e) => {
        isDragging = true;
        hasMoved = false;
        startX = e.clientX;
        startY = e.clientY;
        const rect = el.getBoundingClientRect();
        origX = rect.left;
        origY = rect.top;
        el.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            hasMoved = true;
        }
        if (hasMoved) {
            let newX = origX + dx;
            let newY = origY + dy;

            // Ограничиваем перемещение границами видимой области экрана, чтобы никогда не падала за порожек
            const maxTop = window.innerHeight - 56;
            const maxLeft = window.innerWidth - 56;
            newX = Math.max(8, Math.min(newX, maxLeft));
            newY = Math.max(8, Math.min(newY, maxTop));

            // Примагничивание (Snap) к кнопке алмазика для идеального выравнивания
            const cozyFab = document.getElementById('cozy-fab-trigger');
            if (cozyFab) {
                const cRect = cozyFab.getBoundingClientRect();
                if (Math.abs(newX - cRect.left) < 14) newX = cRect.left;
                if (Math.abs(newY - cRect.top) < 14) newY = cRect.top;
                if (Math.abs(newY - (cRect.top - 52)) < 14) newY = cRect.top - 52;
                if (Math.abs(newY - (cRect.bottom + 8)) < 14) newY = cRect.bottom + 8;
                if (Math.abs(newX - (cRect.right + 8)) < 14) newX = cRect.right + 8;
                if (Math.abs(newX - (cRect.left - 52)) < 14) newX = cRect.left - 52;
            }

            el.style.left = `${newX}px`;
            el.style.top = `${newY}px`;
            el.style.bottom = 'auto';
            el.style.right = 'auto';
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            el.style.transition = '';
            if (hasMoved) {
                const rect = el.getBoundingClientRect();
                localStorage.setItem('mb_fab_pos', JSON.stringify({ left: rect.left, top: rect.top }));
            }
        }
    });

    el.addEventListener('click', (e) => {
        if (hasMoved) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        togglePanel();
    });
}

function togglePanel() {
    const panel = document.getElementById('mb-side-panel');
    const fab = document.getElementById('mb-fab-trigger');
    if (panel) {
        panel.classList.toggle('open');
        if (fab) {
            fab.classList.toggle('active', panel.classList.contains('open'));
        }
    }
}

function updateTokenEstimates() {
    const s = getSettings();
    const totalChars = (s.data.plot || '').length + (s.data.user || '').length + (s.data.other || '').length;
    const approxTokens = Math.round(totalChars / 3.5);
    const tokenDisplay = document.getElementById('mb-tokens-val');
    if (tokenDisplay) {
        tokenDisplay.innerText = `~${approxTokens} t`;
    }
}

function setTheme(themeName) {
    const s = getSettings();
    s.theme = themeName;
    saveModuleSettings();

    const panel = document.getElementById('mb-side-panel');
    if (panel) {
        panel.dataset.theme = themeName;
    }

    document.querySelectorAll('.mb-theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === themeName);
    });
}

function renderUI() {
    if (document.getElementById('mb-fab-trigger')) return;

    const s = getSettings();

    // 1. FAB кнопка
    const fab = document.createElement('div');
    fab.id = 'mb-fab-trigger';
    fab.title = 'Smart Memory Book (Архивариус)';
    fab.innerHTML = '<i class="fa-solid fa-book"></i>';

    const savedPos = localStorage.getItem('mb_fab_pos');
    let restored = false;
    if (savedPos) {
        try {
            const pos = JSON.parse(savedPos);
            // Проверяем, не улетела ли кнопка за пределы экрана
            if (pos.top >= 10 && pos.top <= (window.innerHeight - 60) && pos.left >= 10 && pos.left <= (window.innerWidth - 60)) {
                fab.style.left = `${pos.left}px`;
                fab.style.top = `${pos.top}px`;
                fab.style.bottom = 'auto';
                fab.style.right = 'auto';
                restored = true;
            }
        } catch (e) {}
    }

    if (!restored) {
        // Если улетела или сброшена — ставим ВСЕГДА ровно над алмазиком!
        const cozyFab = document.getElementById('cozy-fab-trigger');
        if (cozyFab) {
            const cRect = cozyFab.getBoundingClientRect();
            fab.style.left = `${cRect.left}px`;
            fab.style.top = `${Math.max(10, cRect.top - 52)}px`;
        } else {
            fab.style.left = '24px';
            fab.style.top = '100px';
        }
        fab.style.bottom = 'auto';
        fab.style.right = 'auto';
    }
    document.body.appendChild(fab);
    makeDraggable(fab);

    // 2. Выдвижная боковая панель
    const panel = document.createElement('div');
    panel.id = 'mb-side-panel';
    panel.dataset.theme = s.theme || 'sakura';
    panel.innerHTML = `
        <div class="mb-header">
            <div class="mb-title-wrap">
                <i class="fa-solid fa-book-bookmark"></i>
                <span>Memory Book</span>
            </div>
            <!-- Переключатель тем (Эмодзи) -->
            <div class="mb-theme-selector">
                <button class="mb-theme-btn ${s.theme === 'sakura' ? 'active' : ''}" data-theme="sakura" title="🌸 Сакура">🌸</button>
                <button class="mb-theme-btn ${s.theme === 'forest' ? 'active' : ''}" data-theme="forest" title="🌲 Лес">🌲</button>
                <button class="mb-theme-btn ${s.theme === 'autumn' ? 'active' : ''}" data-theme="autumn" title="🍂 Осень">🍂</button>
                <button class="mb-theme-btn ${s.theme === 'lavender' ? 'active' : ''}" data-theme="lavender" title="💜 Лаванда">💜</button>
            </div>
            <button class="mb-close-btn" id="mb-btn-close">✕</button>
        </div>
        <div class="mb-body">
            <!-- Сюжет -->
            <div class="mb-card">
                <div class="mb-card-head">
                    <span class="mb-card-title">📜 Хроника сюжета</span>
                    <span class="mb-card-badge">Plot</span>
                </div>
                <textarea id="mb-text-plot" class="mb-textarea" placeholder="Краткая хроника ключевых событий...">${s.data.plot || ''}</textarea>
            </div>

            <!-- Детали о пользователе -->
            <div class="mb-card">
                <div class="mb-card-head">
                    <span class="mb-card-title">👤 Детали о {{user}}</span>
                    <span class="mb-card-badge">Player</span>
                </div>
                <textarea id="mb-text-user" class="mb-textarea" placeholder="Состояние, секреты, черты, инвентарь...">${s.data.user || ''}</textarea>
            </div>

            <!-- Мир и NPC -->
            <div class="mb-card">
                <div class="mb-card-head">
                    <span class="mb-card-title">📌 Мир & Окружение</span>
                    <span class="mb-card-badge">World</span>
                </div>
                <textarea id="mb-text-other" class="mb-textarea" placeholder="Правила, локации, долги и связи с NPC...">${s.data.other || ''}</textarea>
            </div>

            <button class="mb-accordion-toggle" id="mb-toggle-settings">⚙️ Модель, провайдер и промпт ▼</button>
            <div class="mb-accordion-content" id="mb-settings-box">
                <label class="mb-field-label">
                    API Endpoint (Оставьте пустым для модели чата)
                    <input type="text" id="mb-api-url" class="mb-input" placeholder="https://openrouter.ai/api/v1/chat/completions" value="${s.apiUrl || ''}">
                </label>
                <label class="mb-field-label">
                    API Key
                    <input type="password" id="mb-api-key" class="mb-input" placeholder="sk-..." value="${s.apiKey || ''}">
                </label>
                <label class="mb-field-label">
                    ID модели
                    <input type="text" id="mb-api-model" class="mb-input" placeholder="например, gpt-4o-mini" value="${s.model || ''}">
                </label>
                <label class="mb-field-label">
                    Системный промпт Архивариуса
                    <textarea id="mb-prompt-sys" class="mb-textarea" style="min-height:90px;">${s.systemPrompt || ''}</textarea>
                </label>
            </div>
        </div>
        <div class="mb-footer">
            <div class="mb-token-stats">
                <span>Объём памяти: <b id="mb-tokens-val">0 t</b></span>
                <span>Шаг: <b>${s.interval} сообщ.</b></span>
            </div>
            <div class="mb-status-row">
                <span style="color:#9f9da6;">До записи: <b id="mb-counter-val" style="color:#e2bbfd;">${s.messageCounter || 0} / ${s.interval}</b></span>
                <button class="mb-btn-sync" id="mb-btn-manual-sync">⚡ Обновить</button>
            </div>
            <div class="mb-checkbox-row">
                <span>Инъекция в контекст:</span>
                <input type="checkbox" id="mb-check-inject" ${s.injectIntoContext ? 'checked' : ''}>
            </div>
        </div>
    `;

    document.body.appendChild(panel);

    // Слушатели переключения тем
    document.querySelectorAll('.mb-theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setTheme(btn.dataset.theme);
        });
    });

    // Слушатели UI
    document.getElementById('mb-btn-close').addEventListener('click', togglePanel);

    const toggleSettingsBtn = document.getElementById('mb-toggle-settings');
    const settingsBox = document.getElementById('mb-settings-box');
    toggleSettingsBtn.addEventListener('click', () => {
        settingsBox.classList.toggle('open');
    });

    const bindText = (id, key) => {
        document.getElementById(id).addEventListener('input', (e) => {
            s.data[key] = e.target.value;
            saveModuleSettings();
            updateTokenEstimates();
        });
    };
    bindText('mb-text-plot', 'plot');
    bindText('mb-text-user', 'user');
    bindText('mb-text-other', 'other');

    document.getElementById('mb-api-url').addEventListener('change', (e) => { s.apiUrl = e.target.value; saveModuleSettings(); });
    document.getElementById('mb-api-key').addEventListener('change', (e) => { s.apiKey = e.target.value; saveModuleSettings(); });
    document.getElementById('mb-api-model').addEventListener('change', (e) => { s.model = e.target.value; saveModuleSettings(); });
    document.getElementById('mb-prompt-sys').addEventListener('change', (e) => { s.systemPrompt = e.target.value; saveModuleSettings(); });

    document.getElementById('mb-check-inject').addEventListener('change', (e) => {
        s.injectIntoContext = e.target.checked;
        saveModuleSettings();
    });

    document.getElementById('mb-btn-manual-sync').addEventListener('click', () => {
        triggerArchivistUpdate(true);
    });

    updateTokenEstimates();
}

async function triggerArchivistUpdate(isManual = false) {
    const s = getSettings();
    const btn = document.getElementById('mb-btn-manual-sync');
    if (btn) btn.innerText = '⏳ Анализ...';

    try {
        console.log('[Smart Memory Book] Запуск обновления архива...');
        const chatContext = SillyTavern.getContext();
        const chat = chatContext.chat || [];
        const recentMessages = chat.slice(-s.interval).map(m => `${m.is_user ? 'User' : 'Character'}: ${m.mes}`).join('\n');

        const promptText = `
ТЕКУЩИЕ ЗАПИСИ КНИГИ ПАМЯТИ:
[Сюжет]: ${s.data.plot || 'пусто'}
[User]: ${s.data.user || 'пусто'}
[Мир и NPC]: ${s.data.other || 'пусто'}

НОВЫЕ СООБЩЕНИЯ ЧАТА ДЛЯ АНАЛИЗА:
${recentMessages}

Обнови записи на основе новых фактов и верни JSON.`;

        let rawResponse = '';

        if (s.apiUrl && s.apiKey) {
            const res = await fetch(s.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${s.apiKey}`
                },
                body: JSON.stringify({
                    model: s.model || 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: s.systemPrompt },
                        { role: 'user', content: promptText }
                    ],
                    temperature: 0.3
                })
            });
            const json = await res.json();
            rawResponse = json.choices?.[0]?.message?.content || '';
        } else {
            rawResponse = await generateQuietPrompt(
                `${s.systemPrompt}\n\n${promptText}`,
                false,
                true
            );
        }

        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.plot !== undefined) s.data.plot = parsed.plot;
            if (parsed.user !== undefined) s.data.user = parsed.user;
            if (parsed.other !== undefined) s.data.other = parsed.other;

            document.getElementById('mb-text-plot').value = s.data.plot;
            document.getElementById('mb-text-user').value = s.data.user;
            document.getElementById('mb-text-other').value = s.data.other;

            s.messageCounter = 0;
            saveModuleSettings();
            updateTokenEstimates();
            if (window.toastr) window.toastr.success('Книга памяти успешно обновлена Архивариусом!', 'Smart Memory Book');
        } else {
            console.warn('[Smart Memory Book] Ответ не содержал валидного JSON:', rawResponse);
            if (window.toastr) window.toastr.warning('Архивариус ответил не в формате JSON', 'Smart Memory Book');
        }
    } catch (err) {
        console.error('[Smart Memory Book] Ошибка при обновлении:', err);
        if (window.toastr) window.toastr.error('Ошибка при обращении к Архивариусу', 'Smart Memory Book');
    } finally {
        if (btn) btn.innerText = '⚡ Обновить';
        const counterEl = document.getElementById('mb-counter-val');
        if (counterEl) counterEl.innerText = `${s.messageCounter} / ${s.interval}`;
    }
}

function onChatCompletionPromptReady(data) {
    const s = getSettings();
    if (!s.injectIntoContext) return;

    const memoryBlocks = [];
    if (s.data.plot) memoryBlocks.push(`• Сюжет: ${s.data.plot}`);
    if (s.data.user) memoryBlocks.push(`• О {{user}}: ${s.data.user}`);
    if (s.data.other) memoryBlocks.push(`• Мир и NPC: ${s.data.other}`);

    if (memoryBlocks.length > 0) {
        const injectedNote = `\n[MEMORY BOOK ARCHIVE]\n${memoryBlocks.join('\n')}\n[/MEMORY BOOK ARCHIVE]\n`;
        data.extensionPrompt = (data.extensionPrompt || '') + injectedNote;
    }
}

function onMessageReceived() {
    const s = getSettings();
    s.messageCounter = (s.messageCounter || 0) + 1;
    saveModuleSettings();

    const counterEl = document.getElementById('mb-counter-val');
    if (counterEl) counterEl.innerText = `${s.messageCounter} / ${s.interval}`;

    if (s.messageCounter >= s.interval) {
        triggerArchivistUpdate();
    }
}

jQuery(async () => {
    renderUI();
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPromptReady);
    console.log('[Smart Memory Book] Расширение инициализировано.');
});
