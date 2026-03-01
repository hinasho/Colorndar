// ===== Colorndar PWA - app.js =====
// GAS API経由でデータ取得、localStorageで高速キャッシュ

const GAS_URL = 'https://script.google.com/macros/s/AKfycbxlw0sshOG_207Wc_Fde-H883mBb2pmfI32F2nkQOvDWaH3L6APsbAz3OJeY5swaAMviw/exec';

// ===== Storage: localStorage (fast) + GAS API (persistent) =====
const RULES_KEY = 'colorndar_color_rules';
const URL_KEY = 'colorndar_ical_url';
const DATA_KEY = 'colorndar_ical_data';
const INTERVAL_KEY = 'colorndar_update_interval';
const LOCAL_EVENTS_KEY = 'colorndar_local_events';
const WEATHER_CITY_KEY = 'colorndar_weather_city';

function localGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function localSet(key, val) { try { localStorage.setItem(key, val); } catch { } }

function apiLoad() {
    return fetch(GAS_URL + '?action=loadAll')
        .then(r => r.json())
        .then(j => j.success ? j.data : {})
        .catch(() => ({}));
}

function apiSave(key, value) {
    localSet(key, value);
    const params = new URLSearchParams({ action: 'save', key, value });
    fetch(GAS_URL + '?' + params.toString()).catch(() => { });
}

function apiFetchIcal(url) {
    const params = new URLSearchParams({ action: 'fetchIcal', url });
    return fetch(GAS_URL + '?' + params.toString())
        .then(r => r.json())
        .then(j => { if (j.success) return j.data; throw new Error(j.error || '取得失敗'); });
}

// ===== Color Rules =====
const DEFAULT_RULES = [
    { id: 'rule_red', color: '#f87171', label: '休み', keywords: ['休み', '休日', '休暇', '有給', '祝日', '代休', '振替'] },
    { id: 'rule_blue', color: '#60a5fa', label: '会議', keywords: ['会議', 'ミーティング', '打合せ', '打ち合わせ', 'MTG', 'mtg'] },
    { id: 'rule_green', color: '#4ade80', label: '研修', keywords: ['研修', 'トレーニング', '勉強会', 'セミナー'] },
    { id: 'rule_yellow', color: '#fbbf24', label: '締切', keywords: ['締切', '期限', 'デッドライン', '〆切', '納期'] },
    { id: 'rule_purple', color: '#c084fc', label: '出張', keywords: ['出張', '外出', '訪問'] }
];
let rules = [];

function loadRulesFromData(stored) {
    if (stored) { try { rules = JSON.parse(stored); return; } catch { } }
    rules = [...DEFAULT_RULES];
    saveRulesToStorage();
}
function saveRulesToStorage() { const v = JSON.stringify(rules); apiSave(RULES_KEY, v); }
function getRules() { return [...rules]; }
function addRule(r) { const nr = { id: 'rule_' + Date.now(), color: r.color, label: r.label, keywords: r.keywords }; rules.push(nr); saveRulesToStorage(); return nr; }
function updateRuleFn(id, u) { const i = rules.findIndex(r => r.id === id); if (i !== -1) { rules[i] = { ...rules[i], ...u }; saveRulesToStorage(); } }
function deleteRuleFn(id) { rules = rules.filter(r => r.id !== id); saveRulesToStorage(); }
function getEventColor(summary) {
    if (!summary) return { color: '#6b7280', label: null };
    const ls = summary.toLowerCase();
    for (const r of rules) for (const kw of r.keywords) { if (ls.includes(kw.toLowerCase())) return { color: r.color, label: r.label }; }
    return { color: '#6b7280', label: null };
}

// ===== Local Events =====
let localEvents = [];
function loadLocalEvents() {
    const s = localGet(LOCAL_EVENTS_KEY);
    if (s) { try { localEvents = JSON.parse(s); } catch { localEvents = []; } }
}
function saveLocalEvents() { const v = JSON.stringify(localEvents); apiSave(LOCAL_EVENTS_KEY, v); }
function addLocalEvent(ev) { ev.id = 'local_' + Date.now(); ev.isLocal = true; localEvents.push(ev); saveLocalEvents(); return ev; }
function updateLocalEvent(id, u) { const i = localEvents.findIndex(e => e.id === id); if (i !== -1) { localEvents[i] = { ...localEvents[i], ...u }; saveLocalEvents(); } }
function deleteLocalEvent(id) { localEvents = localEvents.filter(e => e.id !== id); saveLocalEvents(); }

// ===== Weather (気象庁 API via GAS proxy) =====
const JMA_CITIES = {
    hachinohe: { name: '八戸', pref: '020000', area: '020030', temp: '31602' },
    aomori: { name: '青森', pref: '020000', area: '020010', temp: '31312' },
    sapporo: { name: '札幌', pref: '016000', area: '016010', temp: '14163' },
    sendai: { name: '仙台', pref: '040000', area: '040010', temp: '34392' },
    niigata: { name: '新潟', pref: '150000', area: '150010', temp: '54232' },
    tokyo: { name: '東京', pref: '130000', area: '130010', temp: '44132' },
    nagoya: { name: '名古屋', pref: '230000', area: '230010', temp: '51106' },
    osaka: { name: '大阪', pref: '270000', area: '270000', temp: '62078' },
    hiroshima: { name: '広島', pref: '340000', area: '340010', temp: '67437' },
    fukuoka: { name: '福岡', pref: '400000', area: '400010', temp: '82182' },
    naha: { name: '那覇', pref: '471000', area: '471010', temp: '91197' }
};
let weatherData = {};
let weatherCity = 'hachinohe';

function jmaCodeToEmoji(code) {
    const c = String(code);
    const first = c.charAt(0);
    if (first === '1') {
        if (c.includes('02') || c.includes('06') || c.includes('14')) return '🌦️';
        if (c.includes('01') || c.includes('10') || c.includes('11')) return '🌤️';
        return '☀️';
    }
    if (first === '2') {
        if (c.includes('02') || c.includes('06') || c.includes('09') || c.includes('14')) return '🌧️';
        if (c.includes('04') || c.includes('13') || c.includes('20') || c.includes('60')) return '🌨️';
        if (c.includes('01') || c.includes('11')) return '⛅';
        return '☁️';
    }
    if (first === '3') {
        if (c.includes('40') || c.includes('15') || c.includes('50')) return '🌨️';
        return '🌧️';
    }
    if (first === '4') return '❄️';
    return '⛈️';
}

function parseDateStr(s) { return s.substring(0, 10); }

async function fetchWeather() {
    const city = JMA_CITIES[weatherCity];
    if (!city) return;
    try {
        const params = new URLSearchParams({ action: 'fetchWeather', areaCode: city.pref });
        const res = await fetch(GAS_URL + '?' + params.toString());
        const json = await res.json();
        if (!json.success || !json.data) return;
        const jma = JSON.parse(json.data);
        weatherData = {};

        // 短期予報 (jma[0]): 今日〜明後日の天気コード
        if (jma[0] && jma[0].timeSeries) {
            const ts0 = jma[0].timeSeries[0];
            if (ts0) {
                const areaData = ts0.areas.find(a => a.area.code === city.area);
                if (areaData && areaData.weatherCodes) {
                    ts0.timeDefines.forEach((td, i) => {
                        const dateKey = parseDateStr(td);
                        if (!weatherData[dateKey]) weatherData[dateKey] = {};
                        weatherData[dateKey].icon = jmaCodeToEmoji(areaData.weatherCodes[i]);
                    });
                }
            }
            // 短期の気温 (timeSeries[2])
            const ts2 = jma[0].timeSeries[2];
            if (ts2) {
                const tempData = ts2.areas.find(a => a.area.code === city.temp);
                if (tempData && tempData.temps) {
                    const dates = ts2.timeDefines;
                    if (dates.length >= 2) {
                        const dateKey = parseDateStr(dates[0]);
                        if (!weatherData[dateKey]) weatherData[dateKey] = {};
                        weatherData[dateKey].min = parseInt(tempData.temps[0]);
                        const dateKey2 = parseDateStr(dates[1]);
                        if (!weatherData[dateKey2]) weatherData[dateKey2] = {};
                        weatherData[dateKey2].max = parseInt(tempData.temps[1]);
                        weatherData[dateKey].max = weatherData[dateKey].max || parseInt(tempData.temps[1]);
                    }
                }
            }
        }

        // 週間予報 (jma[1]): 明日〜7日先の天気コード + 気温
        if (jma[1] && jma[1].timeSeries) {
            const wts0 = jma[1].timeSeries[0];
            if (wts0) {
                const wArea = wts0.areas.find(a => a.area.code === city.area) || wts0.areas[0];
                if (wArea && wArea.weatherCodes) {
                    wts0.timeDefines.forEach((td, i) => {
                        const dateKey = parseDateStr(td);
                        if (!weatherData[dateKey]) weatherData[dateKey] = {};
                        weatherData[dateKey].icon = jmaCodeToEmoji(wArea.weatherCodes[i]);
                    });
                }
            }
            const wts1 = jma[1].timeSeries[1];
            if (wts1) {
                const wTemp = wts1.areas.find(a => a.area.code === city.temp);
                if (wTemp) {
                    wts1.timeDefines.forEach((td, i) => {
                        const dateKey = parseDateStr(td);
                        if (!weatherData[dateKey]) weatherData[dateKey] = {};
                        if (wTemp.tempsMin && wTemp.tempsMin[i] !== '') weatherData[dateKey].min = parseInt(wTemp.tempsMin[i]);
                        if (wTemp.tempsMax && wTemp.tempsMax[i] !== '') weatherData[dateKey].max = parseInt(wTemp.tempsMax[i]);
                    });
                }
            }
        }
    } catch { }
}

// ===== iCal Parser =====
function readIcalFile(file) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('ファイル読み込み失敗')); r.readAsText(file); }); }
function parseIcal(text) {
    const events = [], lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let inEv = false, cur = {};
    for (const line of lines) {
        if (line === 'BEGIN:VEVENT') { inEv = true; cur = {}; }
        else if (line === 'END:VEVENT') { inEv = false; if (cur.summary) events.push(normalizeEvent(cur)); }
        else if (inEv) {
            const ci = line.indexOf(':'); if (ci === -1) continue;
            let key = line.substring(0, ci); const val = line.substring(ci + 1);
            const si = key.indexOf(';'); if (si !== -1) key = key.substring(0, si);
            key = key.toUpperCase();
            if (key === 'SUMMARY') cur.summary = val;
            else if (key === 'DTSTART') cur.dtstart = val;
            else if (key === 'DTEND') cur.dtend = val;
            else if (key === 'DESCRIPTION') cur.description = val;
            else if (key === 'LOCATION') cur.location = val;
            else if (key === 'UID') cur.uid = val;
        }
    }
    return events;
}
function parseIcalDate(ds) {
    if (!ds) return null;
    if (ds.length === 8) return { date: new Date(parseInt(ds.substring(0, 4)), parseInt(ds.substring(4, 6)) - 1, parseInt(ds.substring(6, 8))), allDay: true };
    const y = parseInt(ds.substring(0, 4)), m = parseInt(ds.substring(4, 6)) - 1, d = parseInt(ds.substring(6, 8)), h = parseInt(ds.substring(9, 11)) || 0, mn = parseInt(ds.substring(11, 13)) || 0;
    if (ds.endsWith('Z')) return { date: new Date(Date.UTC(y, m, d, h, mn)), allDay: false };
    return { date: new Date(y, m, d, h, mn), allDay: false };
}
function normalizeEvent(raw) { const s = parseIcalDate(raw.dtstart), e = parseIcalDate(raw.dtend); return { uid: raw.uid || Math.random().toString(36).substr(2, 9), summary: raw.summary || '(無題)', description: raw.description || '', location: raw.location || '', start: s?.date || null, end: e?.date || null, allDay: s?.allDay || false }; }

// ===== Japanese Holidays =====
function getVernalEquinox(y) { return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)); }
function getAutumnalEquinox(y) { return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)); }
function nthWeekday(y, m, dow, n) { const first = new Date(y, m - 1, 1).getDay(); let d = 1 + ((dow - first + 7) % 7) + (n - 1) * 7; return d; }
function getJapaneseHolidays(year) {
    const h = new Set();
    const add = (m, d) => h.add(m + '/' + d);
    add(1, 1);  // 元日
    add(1, nthWeekday(year, 1, 1, 2));  // 成人の日
    add(2, 11); // 建国記念日
    add(2, 23); // 天皇誕生日
    add(3, getVernalEquinox(year)); // 春分の日
    add(4, 29); // 昭和の日
    add(5, 3);  // 憲法記念日
    add(5, 4);  // みどりの日
    add(5, 5);  // こどもの日
    add(7, nthWeekday(year, 7, 1, 3));  // 海の日
    add(8, 11); // 山の日
    add(9, nthWeekday(year, 9, 1, 3));  // 敬老の日
    add(9, getAutumnalEquinox(year)); // 秋分の日
    add(10, nthWeekday(year, 10, 1, 2)); // スポーツの日
    add(11, 3);  // 文化の日
    add(11, 23); // 勤労感謝の日
    // 振替休日: 祝日が日曜なら翌月曜
    const toCheck = [...h];
    for (const key of toCheck) {
        const [m, d] = key.split('/').map(Number);
        const dt = new Date(year, m - 1, d);
        if (dt.getDay() === 0) {
            let nd = new Date(dt); nd.setDate(nd.getDate() + 1);
            while (h.has((nd.getMonth() + 1) + '/' + nd.getDate())) nd.setDate(nd.getDate() + 1);
            h.add((nd.getMonth() + 1) + '/' + nd.getDate());
        }
    }
    return h;
}
let holidayCache = {};
function isHoliday(date) {
    const y = date.getFullYear();
    if (!holidayCache[y]) holidayCache[y] = getJapaneseHolidays(y);
    return holidayCache[y].has((date.getMonth() + 1) + '/' + date.getDate());
}

// ===== Calendar Logic =====
function getShiftMonthRange(year, month) { let sy = year, sm = month - 1; if (sm < 1) { sm = 12; sy--; } return { start: new Date(sy, sm - 1, 21), end: new Date(year, month - 1, 20) }; }
function getCurrentShiftMonth() { const t = new Date(), d = t.getDate(); if (d >= 21) { let m = t.getMonth() + 2, y = t.getFullYear(); if (m > 12) { m = 1; y++; } return { year: y, month: m }; } return { year: t.getFullYear(), month: t.getMonth() + 1 }; }
function generateCalendarGrid(year, month) {
    const { start, end } = getShiftMonthRange(year, month), grid = [];
    const gs = new Date(start); gs.setDate(gs.getDate() - start.getDay());
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let r = 0; r < 6; r++) { const w = []; for (let c = 0; c < 7; c++) { const dt = new Date(gs); dt.setDate(dt.getDate() + (r * 7 + c)); dt.setHours(0, 0, 0, 0); w.push({ date: new Date(dt), day: dt.getDate(), dow: dt.getDay(), isInRange: dt >= start && dt <= end, isToday: dt.getTime() === today.getTime(), events: [] }); } grid.push(w); }
    if (grid[grid.length - 1].every(d => !d.isInRange)) grid.pop();
    return grid;
}
function mapEventsToGrid(grid, events) {
    if (!events || !events.length) return;
    for (const ev of events) { if (!ev.start) continue; const es = new Date(ev.start); es.setHours(0, 0, 0, 0); const ee = ev.end ? new Date(ev.end) : new Date(es); ee.setHours(0, 0, 0, 0); if (ev.allDay && ev.end) ee.setDate(ee.getDate() - 1); for (const w of grid) for (const c of w) { const ct = c.date.getTime(); if (ct >= es.getTime() && ct <= ee.getTime()) { const ci = getEventColor(ev.summary); c.events.push({ ...ev, displayColor: ci.color, ruleLabel: ci.label }); } } }
}
function mapLocalEventsToGrid(grid) {
    for (const ev of localEvents) {
        if (!ev.date) continue;
        const ed = new Date(ev.date); ed.setHours(0, 0, 0, 0);
        for (const w of grid) for (const c of w) {
            if (c.date.getTime() === ed.getTime()) {
                c.events.push({ uid: ev.id, summary: ev.title, description: ev.memo || '', start: ev.allDay ? ed : new Date(ev.date + 'T' + (ev.startTime || '00:00')), end: ev.allDay ? ed : new Date(ev.date + 'T' + (ev.endTime || '23:59')), allDay: ev.allDay, displayColor: ev.color || '#6366f1', isLocal: true, localId: ev.id });
            }
        }
    }
}
function renderCalendar(grid, el, onClick) {
    el.innerHTML = '';
    for (const w of grid) for (const c of w) {
        const d = document.createElement('div'); d.className = 'day-cell';
        if (!c.isInRange) d.classList.add('outside');
        if (c.isToday) d.classList.add('today');
        if (c.dow === 0) d.classList.add('sun');
        if (c.dow === 6) d.classList.add('sat');
        if (isHoliday(c.date)) d.classList.add('holiday');
        const dayTop = document.createElement('div'); dayTop.className = 'day-top';
        const n = document.createElement('div'); n.className = 'day-number'; n.textContent = c.day; dayTop.appendChild(n);
        const dateKey = c.date.getFullYear() + '-' + String(c.date.getMonth() + 1).padStart(2, '0') + '-' + String(c.date.getDate()).padStart(2, '0');
        const w = weatherData[dateKey];
        if (w) {
            const we = document.createElement('div'); we.className = 'day-weather';
            we.innerHTML = '<span class="weather-icon">' + w.icon + '</span><span class="temp-max">' + w.max + '°</span><span class="temp-min">' + w.min + '°</span>';
            dayTop.appendChild(we);
        }
        d.appendChild(dayTop);
        if (c.events.length > 0) {
            const ev = document.createElement('div'); ev.className = 'day-events'; const ms = 3, ts = c.events.slice(0, ms);
            for (const e of ts) { const el2 = document.createElement('div'); el2.className = 'event-label'; el2.style.backgroundColor = e.displayColor + '25'; el2.style.color = e.displayColor; el2.style.borderLeft = '2px solid ' + e.displayColor; el2.textContent = e.summary; ev.appendChild(el2); }
            if (c.events.length > ms) { const m = document.createElement('div'); m.className = 'events-more'; m.textContent = '+' + String(c.events.length - ms); ev.appendChild(m); }
            d.appendChild(ev);
        }
        if (c.isInRange) d.addEventListener('click', () => onClick(c));
        el.appendChild(d);
    }
}

// ===== Updater =====
let timer = null, updateCb = null, cachedInterval = 30;
function setUpdateCallback(cb) { updateCb = cb; }
function startAutoUpdate() { stopAutoUpdate(); if (cachedInterval <= 0) return; timer = setInterval(() => { if (updateCb) updateCb(); }, cachedInterval * 60 * 1000); }
function stopAutoUpdate() { if (timer) { clearInterval(timer); timer = null; } }
function formatLastUpdate(d) { if (!d) return ''; return '最終更新: ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

// ===== Main App =====
let currentMonth = getCurrentShiftMonth(), events = [], lastUpdateTime = null, editingRuleId = null;
let savedIcalUrl = '', savedIcalData = '';
const $ = id => document.getElementById(id);
const monthTitleEl = $('month-title'), monthRangeEl = $('month-range'), prevBtn = $('prev-month'), nextBtn = $('next-month'), calendarGridEl = $('calendar-grid'), refreshBtn = $('refresh-btn'), lastUpdateEl = $('last-update'), settingsToggle = $('settings-toggle'), settingsPanel = $('settings-panel'), settingsClose = $('settings-close'), icalUrlInput = $('ical-url'), loadUrlBtn = $('load-url-btn'), icalFileInput = $('ical-file'), colorRulesListEl = $('color-rules-list'), addRuleBtn = $('add-rule-btn'), updateIntervalSelect = $('update-interval'), eventDetailModal = $('event-detail-modal'), modalDateTitle = $('modal-date-title'), modalEventsList = $('modal-events-list'), modalCloseBtn = $('modal-close'), ruleEditModal = $('rule-edit-modal'), ruleEditTitleEl = $('rule-edit-title'), ruleColorInput = $('rule-color'), ruleLabelInput = $('rule-label'), ruleKeywordsInput = $('rule-keywords'), ruleSaveBtn = $('rule-save-btn'), ruleCancelBtn = $('rule-cancel-btn'), ruleEditCloseBtn = $('rule-edit-close');

function renderMonth() {
    monthTitleEl.textContent = currentMonth.year + '年 ' + currentMonth.month + '月度';
    const { start, end } = getShiftMonthRange(currentMonth.year, currentMonth.month);
    monthRangeEl.textContent = (start.getMonth() + 1) + '/' + start.getDate() + ' 〜 ' + (end.getMonth() + 1) + '/' + end.getDate();
    const g = generateCalendarGrid(currentMonth.year, currentMonth.month);
    mapEventsToGrid(g, events);
    mapLocalEventsToGrid(g);
    renderCalendar(g, calendarGridEl, onDayClick);
}

let currentDetailDate = null;
function onDayClick(cell) {
    const d = cell.date;
    currentDetailDate = d;
    modalDateTitle.textContent = (d.getMonth() + 1) + '月' + d.getDate() + '日（' + '日月火水木金土'[d.getDay()] + '）';
    modalEventsList.innerHTML = '';
    if (!cell.events.length) {
        const e = document.createElement('div'); e.className = 'modal-event-empty'; e.textContent = 'イベントはありません'; modalEventsList.appendChild(e);
    } else {
        for (const ev of cell.events) {
            const i = document.createElement('div'); i.className = 'modal-event-item'; i.style.borderLeftColor = ev.displayColor;
            let t = '終日';
            if (!ev.allDay && ev.start) { const s = new Date(ev.start); t = String(s.getHours()).padStart(2, '0') + ':' + String(s.getMinutes()).padStart(2, '0'); if (ev.end) { const e2 = new Date(ev.end); t += ' - ' + String(e2.getHours()).padStart(2, '0') + ':' + String(e2.getMinutes()).padStart(2, '0'); } }
            let actions = '';
            if (ev.isLocal) { actions = '<div class="local-event-actions"><button class="local-edit-btn" data-id="' + ev.localId + '">✏️</button><button class="local-delete-btn" data-id="' + ev.localId + '">🗑️</button></div>'; }
            i.innerHTML = '<span class="modal-event-time">' + t + '</span><div style="flex:1"><div class="modal-event-title" style="color:' + ev.displayColor + '">' + ev.summary + '</div>' + (ev.description ? '<div style="font-size:0.72rem;color:var(--text-secondary);margin-top:4px">' + ev.description + '</div>' : '') + '</div>' + actions;
            modalEventsList.appendChild(i);
        }
    }
    eventDetailModal.classList.remove('hidden');
}

// ===== Event Add/Edit Modal =====
const eventEditModal = $('event-edit-modal'), eventEditTitle = $('event-edit-title'), eventTitleInput = $('event-title'), eventAlldayCheck = $('event-allday'), eventTimeGroup = $('event-time-group'), eventStartTime = $('event-start-time'), eventEndTime = $('event-end-time'), eventColorInput = $('event-color'), eventMemoInput = $('event-memo'), eventSaveBtn = $('event-save-btn'), eventDeleteBtn = $('event-delete-btn'), eventCancelBtn = $('event-cancel-btn'), eventEditClose = $('event-edit-close'), modalAddEventBtn = $('modal-add-event');
let editingEventId = null, editingEventDate = null;

function openEventEditor(date, existingId) {
    editingEventDate = typeof date === 'string' ? date : date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    if (existingId) {
        const ev = localEvents.find(e => e.id === existingId);
        if (!ev) return;
        editingEventId = existingId;
        eventEditTitle.textContent = '予定編集';
        eventTitleInput.value = ev.title;
        eventAlldayCheck.checked = ev.allDay;
        eventTimeGroup.classList.toggle('hidden', ev.allDay);
        eventStartTime.value = ev.startTime || '09:00';
        eventEndTime.value = ev.endTime || '10:00';
        eventColorInput.value = ev.color || '#6366f1';
        eventMemoInput.value = ev.memo || '';
        eventDeleteBtn.classList.remove('hidden');
    } else {
        editingEventId = null;
        eventEditTitle.textContent = '予定追加';
        eventTitleInput.value = '';
        eventAlldayCheck.checked = true;
        eventTimeGroup.classList.add('hidden');
        eventStartTime.value = '09:00';
        eventEndTime.value = '10:00';
        eventColorInput.value = '#6366f1';
        eventMemoInput.value = '';
        eventDeleteBtn.classList.add('hidden');
    }
    eventEditModal.classList.remove('hidden');
}

function saveEventFromEditor() {
    const title = eventTitleInput.value.trim();
    if (!title) { showToast('タイトルを入力してください'); return; }
    const data = { title, date: editingEventDate, allDay: eventAlldayCheck.checked, startTime: eventStartTime.value, endTime: eventEndTime.value, color: eventColorInput.value, memo: eventMemoInput.value.trim() };
    if (editingEventId) { updateLocalEvent(editingEventId, data); showToast('予定を更新しました'); }
    else { addLocalEvent(data); showToast('予定を追加しました'); }
    eventEditModal.classList.add('hidden');
    eventDetailModal.classList.add('hidden');
    renderMonth();
}

async function loadFromUrl() {
    const url = icalUrlInput.value.trim();
    if (!url) { showToast('URLを入力してください'); return; }
    try {
        refreshBtn.classList.add('loading'); showToast('読み込み中...');
        const t = await apiFetchIcal(url);
        events = parseIcal(t); savedIcalUrl = url; savedIcalData = t;
        apiSave(URL_KEY, url); apiSave(DATA_KEY, t);
        lastUpdateTime = new Date(); lastUpdateEl.textContent = formatLastUpdate(lastUpdateTime);
        renderMonth(); showToast(events.length + '件のイベントを読み込みました');
    } catch (e) { showToast('エラー: ' + e.message); }
    finally { refreshBtn.classList.remove('loading'); }
}

async function loadFromFile(file) {
    try {
        refreshBtn.classList.add('loading'); showToast('読み込み中...');
        const t = await readIcalFile(file);
        events = parseIcal(t); savedIcalData = t;
        apiSave(DATA_KEY, t);
        lastUpdateTime = new Date(); lastUpdateEl.textContent = formatLastUpdate(lastUpdateTime);
        renderMonth(); showToast(events.length + '件のイベントを読み込みました');
    } catch (e) { showToast('エラー: ' + e.message); }
    finally { refreshBtn.classList.remove('loading'); }
}

async function refreshData() {
    if (savedIcalUrl) { icalUrlInput.value = savedIcalUrl; await loadFromUrl(); return; }
    if (savedIcalData) { events = parseIcal(savedIcalData); lastUpdateTime = new Date(); lastUpdateEl.textContent = formatLastUpdate(lastUpdateTime); renderMonth(); showToast('更新しました'); }
    else { showToast('データソースが未設定です'); }
}

function renderColorRulesUI() {
    colorRulesListEl.innerHTML = '';
    for (const r of getRules()) {
        const i = document.createElement('div'); i.className = 'color-rule-item';
        i.innerHTML = '<div class="rule-color-dot" style="background:' + r.color + '"></div><div class="rule-info"><div class="rule-label-text">' + r.label + '</div><div class="rule-keywords-text">' + r.keywords.join(', ') + '</div></div><div class="rule-actions"><button data-action="edit" data-id="' + r.id + '" aria-label="編集">✏️</button><button data-action="delete" data-id="' + r.id + '" aria-label="削除">🗑️</button></div>';
        colorRulesListEl.appendChild(i);
    }
}

function openRuleEditor(id) {
    if (id) { const r = getRules().find(x => x.id === id); if (!r) return; editingRuleId = id; ruleEditTitleEl.textContent = 'ルール編集'; ruleColorInput.value = r.color; ruleLabelInput.value = r.label; ruleKeywordsInput.value = r.keywords.join(', '); }
    else { editingRuleId = null; ruleEditTitleEl.textContent = '新規ルール'; ruleColorInput.value = '#6366f1'; ruleLabelInput.value = ''; ruleKeywordsInput.value = ''; }
    ruleEditModal.classList.remove('hidden');
}
function saveRuleFromEditor() {
    const c = ruleColorInput.value, l = ruleLabelInput.value.trim(), ks = ruleKeywordsInput.value.trim();
    if (!l) { showToast('ラベルを入力してください'); return; }
    if (!ks) { showToast('キーワードを入力してください'); return; }
    const kw = ks.split(/[,、，]/).map(k => k.trim()).filter(k => k);
    if (editingRuleId) updateRuleFn(editingRuleId, { color: c, label: l, keywords: kw }); else addRule({ color: c, label: l, keywords: kw });
    ruleEditModal.classList.add('hidden'); renderColorRulesUI(); renderMonth(); showToast('ルールを保存しました');
}

function showToast(msg) {
    const ex = document.querySelector('.toast'); if (ex) ex.remove();
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 300); }, 2500);
}

function showUpdateToast() {
    const ex = document.querySelector('.update-toast'); if (ex) return;
    const t = document.createElement('div');
    t.className = 'update-toast';
    t.innerHTML = '🔄 新しいバージョンがあります <button onclick="location.reload()">更新</button>';
    document.body.appendChild(t);
}

// ===== Init: Instant render + background data load =====
function initApp() {
    // Phase 1: 即座描画（localStorageキャッシュ優先）
    loadLocalEvents();
    weatherCity = localGet(WEATHER_CITY_KEY) || 'hachinohe';
    const weatherSelect = $('weather-city');
    if (weatherSelect) weatherSelect.value = weatherCity;
    loadRulesFromData(localGet(RULES_KEY));
    savedIcalUrl = localGet(URL_KEY) || '';
    if (savedIcalUrl) icalUrlInput.value = savedIcalUrl;
    const iv = localGet(INTERVAL_KEY);
    if (iv) { cachedInterval = parseInt(iv); updateIntervalSelect.value = String(cachedInterval); }
    savedIcalData = localGet(DATA_KEY) || '';
    if (savedIcalData) {
        events = parseIcal(savedIcalData);
        lastUpdateTime = new Date();
        lastUpdateEl.textContent = formatLastUpdate(lastUpdateTime);
    }
    renderMonth();
    renderColorRulesUI();
    setupEventListeners();
    setUpdateCallback(refreshData);
    startAutoUpdate();

    // Phase 2: GAS APIから最新データをバックグラウンド取得
    apiLoad().then(allData => {
        let needRerender = false;
        if (allData[RULES_KEY] && allData[RULES_KEY] !== localGet(RULES_KEY)) {
            localSet(RULES_KEY, allData[RULES_KEY]);
            loadRulesFromData(allData[RULES_KEY]);
            renderColorRulesUI();
            needRerender = true;
        }
        if (allData[URL_KEY]) { savedIcalUrl = allData[URL_KEY]; localSet(URL_KEY, savedIcalUrl); icalUrlInput.value = savedIcalUrl; }
        if (allData[INTERVAL_KEY]) { cachedInterval = parseInt(allData[INTERVAL_KEY]); localSet(INTERVAL_KEY, allData[INTERVAL_KEY]); updateIntervalSelect.value = String(cachedInterval); startAutoUpdate(); }
        if (allData[DATA_KEY] && allData[DATA_KEY] !== localGet(DATA_KEY)) {
            savedIcalData = allData[DATA_KEY]; localSet(DATA_KEY, savedIcalData);
            events = parseIcal(savedIcalData);
            lastUpdateTime = new Date(); lastUpdateEl.textContent = formatLastUpdate(lastUpdateTime);
            needRerender = true;
        }
        if (allData[LOCAL_EVENTS_KEY] && allData[LOCAL_EVENTS_KEY] !== localGet(LOCAL_EVENTS_KEY)) {
            localSet(LOCAL_EVENTS_KEY, allData[LOCAL_EVENTS_KEY]);
            loadLocalEvents();
            needRerender = true;
        }
        if (needRerender) renderMonth();

        // Phase 3: 天気予報を取得
        fetchWeather().then(() => renderMonth());

        // Phase 4: URLから最新iCalデータを取得
        if (savedIcalUrl) {
            apiFetchIcal(savedIcalUrl).then(t => {
                events = parseIcal(t); savedIcalData = t;
                apiSave(DATA_KEY, t);
                lastUpdateTime = new Date(); lastUpdateEl.textContent = formatLastUpdate(lastUpdateTime);
                renderMonth();
            }).catch(() => { });
        }
    }).catch(() => { });
}

function setupEventListeners() {
    prevBtn.addEventListener('click', () => { currentMonth.month--; if (currentMonth.month < 1) { currentMonth.month = 12; currentMonth.year--; } renderMonth(); });
    nextBtn.addEventListener('click', () => { currentMonth.month++; if (currentMonth.month > 12) { currentMonth.month = 1; currentMonth.year++; } renderMonth(); });
    refreshBtn.addEventListener('click', async () => { refreshBtn.classList.add('loading'); await refreshData(); refreshBtn.classList.remove('loading'); });
    document.querySelector('.app-title').addEventListener('click', () => { currentMonth = getCurrentShiftMonth(); renderMonth(); });
    settingsToggle.addEventListener('click', () => settingsPanel.classList.remove('hidden'));
    settingsClose.addEventListener('click', () => settingsPanel.classList.add('hidden'));
    loadUrlBtn.addEventListener('click', loadFromUrl);
    icalFileInput.addEventListener('change', e => { const f = e.target.files[0]; if (f) loadFromFile(f); });
    updateIntervalSelect.addEventListener('change', e => { cachedInterval = parseInt(e.target.value); apiSave(INTERVAL_KEY, String(cachedInterval)); startAutoUpdate(); showToast('更新間隔を' + (e.target.value === '0' ? 'オフ' : e.target.value + '分') + 'に設定しました'); });
    modalCloseBtn.addEventListener('click', () => eventDetailModal.classList.add('hidden'));
    eventDetailModal.addEventListener('click', e => { if (e.target === eventDetailModal) eventDetailModal.classList.add('hidden'); });
    colorRulesListEl.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; if (b.dataset.action === 'edit') openRuleEditor(b.dataset.id); else if (b.dataset.action === 'delete') { deleteRuleFn(b.dataset.id); renderColorRulesUI(); renderMonth(); showToast('ルールを削除しました'); } });
    addRuleBtn.addEventListener('click', () => openRuleEditor(null));
    ruleSaveBtn.addEventListener('click', saveRuleFromEditor);
    ruleCancelBtn.addEventListener('click', () => ruleEditModal.classList.add('hidden'));
    ruleEditCloseBtn.addEventListener('click', () => ruleEditModal.classList.add('hidden'));
    ruleEditModal.addEventListener('click', e => { if (e.target === ruleEditModal) ruleEditModal.classList.add('hidden'); });
    // Local event modal
    modalAddEventBtn.addEventListener('click', () => { if (currentDetailDate) openEventEditor(currentDetailDate, null); });
    eventSaveBtn.addEventListener('click', saveEventFromEditor);
    eventCancelBtn.addEventListener('click', () => eventEditModal.classList.add('hidden'));
    eventEditClose.addEventListener('click', () => eventEditModal.classList.add('hidden'));
    eventEditModal.addEventListener('click', e => { if (e.target === eventEditModal) eventEditModal.classList.add('hidden'); });
    eventAlldayCheck.addEventListener('change', () => eventTimeGroup.classList.toggle('hidden', eventAlldayCheck.checked));
    eventDeleteBtn.addEventListener('click', () => { if (editingEventId) { deleteLocalEvent(editingEventId); showToast('予定を削除しました'); eventEditModal.classList.add('hidden'); eventDetailModal.classList.add('hidden'); renderMonth(); } });
    // Weather city selector
    const weatherCitySelect = $('weather-city');
    if (weatherCitySelect) {
        weatherCitySelect.addEventListener('change', e => {
            weatherCity = e.target.value; localSet(WEATHER_CITY_KEY, weatherCity);
            fetchWeather().then(() => { renderMonth(); showToast(JMA_CITIES[weatherCity].name + 'の天気予報に切り替えました'); });
        });
    }
    // Detail modal: edit/delete local events
    modalEventsList.addEventListener('click', e => {
        const editBtn = e.target.closest('.local-edit-btn');
        const deleteBtn = e.target.closest('.local-delete-btn');
        if (editBtn) { eventDetailModal.classList.add('hidden'); openEventEditor(currentDetailDate, editBtn.dataset.id); }
        if (deleteBtn) { deleteLocalEvent(deleteBtn.dataset.id); showToast('予定を削除しました'); eventDetailModal.classList.add('hidden'); renderMonth(); }
    });
    let touchStartX = 0;
    calendarGridEl.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
    calendarGridEl.addEventListener('touchend', e => { const d = touchStartX - e.changedTouches[0].screenX; if (Math.abs(d) > 60) { if (d > 0) { currentMonth.month++; if (currentMonth.month > 12) { currentMonth.month = 1; currentMonth.year++; } } else { currentMonth.month--; if (currentMonth.month < 1) { currentMonth.month = 12; currentMonth.year--; } } renderMonth(); } }, { passive: true });
}

// Register Service Worker + detect updates
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
        // 新しいSWがインストールされた時
        reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                    showUpdateToast();
                }
            });
        });
        // 起動時に更新チェック
        reg.update().catch(() => { });
    }).catch(() => { });
    // コントローラー切替時もリロード促進
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        showUpdateToast();
    });
}

// Start
initApp();
