// Initialize
let todos = [];
let archivedTodos = [];
let nextDayTodos = [];
let projects = [];
let stocks = []; // 股票观测列表
let activeView = 'tasks';
let isStockDashboardOpen = false; // 是否在股票观测dashboard
let timelineRangeWeeks = 4;
let activeStreamInteraction = null;
let activeStockInteraction = null; // 股票拖拽交互状态

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STREAM_MIN_DURATION_MS = MS_PER_DAY;
const DEFAULT_PROJECT_DURATION_DAYS = 28;
const DEFAULT_STREAM_DURATION_DAYS = 7;

// 流程条预设颜色（RGB格式，用于rgba）
const STREAM_COLOR_PRESETS = [
  { bg: '74, 222, 128', text: '20, 83, 45', handle: '20, 83, 45' }, // 绿色
  { bg: '251, 146, 60', text: '154, 52, 18', handle: '154, 52, 18' }, // 橙色
  { bg: '168, 85, 247', text: '88, 28, 135', handle: '88, 28, 135' }, // 紫色
  { bg: '236, 72, 153', text: '157, 23, 77', handle: '157, 23, 77' }, // 粉色
];
const DEFAULT_STREAM_COLOR = STREAM_COLOR_PRESETS[0];
const VIEW_SEQUENCE = ['tasks', 'projects', 'stocks'];

function createUniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// DOM elements
const todoInput = document.getElementById('todoInput');
const todoList = document.getElementById('todoList');
const emptyState = document.getElementById('emptyState');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const newDayBtn = document.getElementById('newDayBtn');
const menuBtn = document.getElementById('menuBtn');
const dropdownMenu = document.getElementById('dropdownMenu');
const historyBtn = document.getElementById('historyBtn');
const historyModal = document.getElementById('historyModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const historyContent = document.getElementById('historyContent');
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
const backgroundColorPicker = document.getElementById('backgroundColorPicker');
const header = document.querySelector('.header');
const headerBgUpload = document.getElementById('headerBgUpload');
const uploadHeaderBgBtn = document.getElementById('uploadHeaderBgBtn');
const resetHeaderBgBtn = document.getElementById('resetHeaderBgBtn');
const headerBgPreview = document.getElementById('headerBgPreview');
const headerBgPreviewImg = document.getElementById('headerBgPreviewImg');
const taskView = document.getElementById('taskView');
const projectView = document.getElementById('projectView');
const stockDashboardView = document.getElementById('stockDashboardView');
const currentDateDisplay = document.getElementById('currentDateDisplay');
const projectList = document.getElementById('projectList');
const projectEmptyState = document.getElementById('projectEmptyState');
const timelineRangeSelect = document.getElementById('timelineRangeSelect');
const addStreamBtn = document.getElementById('addStreamBtn');
const viewToggleButtons = document.querySelectorAll('.view-toggle-btn');
const viewToggle = document.querySelector('.view-toggle');
const viewToggleThumb = document.querySelector('.view-toggle-thumb');
const stockList = document.getElementById('stockList');
const addStockBtn = document.getElementById('addStockBtn');

const NEW_DAY_LONG_PRESS_DURATION = 1000;
let newDayPressTimer = null;
let newDayToastTimer = null;
const TODO_DATA_KEYS = ['todos', 'archivedTodos', 'nextDayTodos'];
const TODO_STATE_META_KEY = 'todosUpdatedAt';
const TODO_STORAGE_KEYS = [...TODO_DATA_KEYS, TODO_STATE_META_KEY];
const SETTINGS_STORAGE_KEYS = ['backgroundColor', 'projects', 'activeView', 'headerBackgroundImage', 'stocks'];
const todoStorageArea = chrome.storage && chrome.storage.local ? chrome.storage.local : chrome.storage.sync;
const syncStorageArea = chrome.storage && chrome.storage.sync ? chrome.storage.sync : chrome.storage.local;
const shouldSyncLightweightTodos = Boolean(syncStorageArea && syncStorageArea !== todoStorageArea);

// Load todos from storage
function loadTodos() {
  const applyTodoData = (data = {}) => {
    todos = (data.todos || []).map(todo => ({
      ...todo,
      subtasks: todo.subtasks || [],
      expanded: todo.expanded === true ? true : false
    }));
    archivedTodos = data.archivedTodos || [];
    nextDayTodos = (data.nextDayTodos || []).map(todo => ({
      ...todo,
      subtasks: todo.subtasks || [],
      expanded: todo.expanded === true ? true : false
    }));
    renderTodos();
  };
    
  const applySettingsData = (data = {}) => {
    const bgColor = data.backgroundColor || '#f5f5f5';
    applyBackgroundColor(bgColor);
    if (backgroundColorPicker) {
      backgroundColorPicker.value = bgColor;
    }
    
    // Apply header background image
    if (data.headerBackgroundImage) {
      applyHeaderBackgroundImage(data.headerBackgroundImage);
      if (headerBgPreviewImg) {
        headerBgPreviewImg.src = data.headerBackgroundImage;
        if (headerBgPreview) {
          headerBgPreview.style.display = 'block';
        }
      }
    } else {
      resetHeaderBackgroundImage();
    }

    const storedProjects = normalizeProjects(data.projects);
    if (storedProjects.length > 0) {
      projects = storedProjects;
    } else {
      projects = getSampleProjects();
      saveProjects(projects, { silent: true });
    }

    activeView = data.activeView || 'tasks';
    renderProjects();
    
    // Load stocks
    stocks = data.stocks || [];
    setActiveView(activeView, { skipStorage: true });
  };

  if (!shouldSyncLightweightTodos) {
    syncStorageArea.get([...TODO_STORAGE_KEYS, ...SETTINGS_STORAGE_KEYS], (data = {}) => {
      const todoPayload = {
        todos: data.todos || [],
        archivedTodos: data.archivedTodos || [],
        nextDayTodos: data.nextDayTodos || []
      };
      applyTodoData(todoPayload);
      applySettingsData(data);
    });
    return;
  }

  todoStorageArea.get(TODO_STORAGE_KEYS, (localData = {}) => {
    syncStorageArea.get([...TODO_STORAGE_KEYS, ...SETTINGS_STORAGE_KEYS], (syncData = {}) => {
      const localHasState = Object.prototype.hasOwnProperty.call(localData, 'todos');
      const syncHasState = Object.prototype.hasOwnProperty.call(syncData, 'todos');
      const localTimestamp = localData[TODO_STATE_META_KEY] || 0;
      const syncTimestamp = syncData[TODO_STATE_META_KEY] || 0;
      const shouldUseSyncTodos = (syncHasState && !localHasState) ||
        (syncHasState && syncTimestamp > localTimestamp);
      const archivedFromLocal = Object.prototype.hasOwnProperty.call(localData, 'archivedTodos')
        ? localData.archivedTodos
        : undefined;
      const archivedFallback = Object.prototype.hasOwnProperty.call(syncData, 'archivedTodos')
        ? syncData.archivedTodos
        : [];
      const archivedToUse = archivedFromLocal !== undefined ? archivedFromLocal : archivedFallback;
      const todoPayload = {
        todos: shouldUseSyncTodos ? (syncData.todos || []) : (localData.todos || []),
        nextDayTodos: shouldUseSyncTodos ? (syncData.nextDayTodos || []) : (localData.nextDayTodos || []),
        archivedTodos: archivedToUse || []
      };

      applyTodoData(todoPayload);
      applySettingsData(syncData);

      const needsLocalUpdate = shouldUseSyncTodos || !localHasState || !localTimestamp;
      if (needsLocalUpdate) {
        todoStorageArea.set({
          todos: todoPayload.todos,
          nextDayTodos: todoPayload.nextDayTodos,
          archivedTodos: todoPayload.archivedTodos,
          [TODO_STATE_META_KEY]: shouldUseSyncTodos
            ? (syncTimestamp || Date.now())
            : (localTimestamp || Date.now())
        }, () => {
          if (chrome.runtime.lastError) {
            console.warn('Failed to persist todo data locally:', chrome.runtime.lastError);
          }
        });
      }
    });
  });
}

// Apply background color to body and container
function applyBackgroundColor(color) {
  document.body.style.backgroundColor = color;
  const container = document.querySelector('.container');
  if (container) {
    container.style.backgroundColor = color;
  }
}

// Save background color to storage
function saveBackgroundColor(color) {
  chrome.storage.sync.set({ backgroundColor: color }, () => {
    applyBackgroundColor(color);
  });
}

// Apply header background image
function applyHeaderBackgroundImage(imageData) {
  if (header) {
    // Use CSS custom property to set background image
    header.style.setProperty('--header-bg-image', `url(${imageData})`);
    // Update the ::before pseudo-element via a style element or inline style
    const styleId = 'header-bg-style';
    let styleElement = document.getElementById(styleId);
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }
    styleElement.textContent = `
      .header::before {
        background-image: url(${imageData});
      }
    `;
  }
}

// Reset header background image to default
function resetHeaderBackgroundImage() {
  if (header) {
    const styleId = 'header-bg-style';
    const styleElement = document.getElementById(styleId);
    if (styleElement) {
      styleElement.remove();
    }
    header.style.removeProperty('--header-bg-image');
  }
  if (headerBgPreview) {
    headerBgPreview.style.display = 'none';
  }
  if (headerBgPreviewImg) {
    headerBgPreviewImg.src = '';
  }
}

// Save header background image to storage
function saveHeaderBackgroundImage(imageData) {
  chrome.storage.sync.set({ headerBackgroundImage: imageData }, () => {
    applyHeaderBackgroundImage(imageData);
    if (headerBgPreviewImg) {
      headerBgPreviewImg.src = imageData;
      if (headerBgPreview) {
        headerBgPreview.style.display = 'block';
      }
    }
  });
}

function setActiveView(view = 'tasks', options = {}) {
  const { skipStorage = false } = options;
  const normalizedView = VIEW_SEQUENCE.includes(view) ? view : 'tasks';
  activeView = normalizedView;
  
  const isTasks = normalizedView === 'tasks';
  const isProjects = normalizedView === 'projects';
  const isStocks = normalizedView === 'stocks';
  
  if (taskView) {
    taskView.classList.toggle('hidden', !isTasks);
  }
  if (projectView) {
    projectView.classList.toggle('visible', isProjects);
    projectView.setAttribute('aria-hidden', isProjects ? 'false' : 'true');
  }
  if (stockDashboardView) {
    stockDashboardView.classList.toggle('visible', isStocks);
    stockDashboardView.setAttribute('aria-hidden', isStocks ? 'false' : 'true');
  }
  
  document.body.classList.toggle('view-projects', isProjects);
  isStockDashboardOpen = isStocks;
  
  if (isProjects) {
    renderProjects();
  } else if (isTasks) {
    updateCurrentDateDisplay();
  } else if (isStocks) {
    renderStocks(true);
  }
  
  updateViewToggleState(normalizedView);
  
  if (!skipStorage) {
    chrome.storage.sync.set({ activeView: normalizedView });
  }
}

function updateViewToggleState(view) {
  const index = VIEW_SEQUENCE.indexOf(view);
  if (viewToggle) {
    const safeIndex = index >= 0 ? index : 0;
    viewToggle.style.setProperty('--active-index', safeIndex.toString());
    updateViewToggleThumbPosition(safeIndex);
  }
  
  if (viewToggleButtons && viewToggleButtons.length > 0) {
    viewToggleButtons.forEach(btn => {
      const isActive = btn.dataset.view === view;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }
}

function updateViewToggleThumbPosition(index) {
  if (!viewToggle || !viewToggleThumb || !viewToggleButtons || viewToggleButtons.length === 0) {
    return;
  }
  const safeIndex = Math.max(0, Math.min(index, viewToggleButtons.length - 1));
  const targetButton = viewToggleButtons[safeIndex];
  if (!targetButton) return;

  // 使用动画帧确保布局信息最新
  requestAnimationFrame(() => {
    const toggleRect = viewToggle.getBoundingClientRect();
    const buttonRect = targetButton.getBoundingClientRect();
    if (toggleRect.width === 0 || buttonRect.width === 0) {
      return;
    }
    const translate = buttonRect.left - toggleRect.left;
    viewToggleThumb.style.setProperty('--thumb-width', `${buttonRect.width}px`);
    viewToggleThumb.style.setProperty('--thumb-translate', `${translate}px`);
  });
}

// Save todos to storage
function saveTodos() {
  const timestamp = Date.now();
  const payload = {
    todos: todos,
    archivedTodos: archivedTodos,
    nextDayTodos: nextDayTodos,
    [TODO_STATE_META_KEY]: timestamp
  };

  todoStorageArea.set(payload, () => {
    if (chrome.runtime.lastError) {
      console.error('Failed to save todos locally:', chrome.runtime.lastError);
    }
    renderTodos();
  });

  if (shouldSyncLightweightTodos) {
    syncStorageArea.set({
      todos: todos,
      nextDayTodos: nextDayTodos,
      [TODO_STATE_META_KEY]: timestamp
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn('Sync save skipped:', chrome.runtime.lastError);
      }
    });
  }
}

function limitProjectsToSingle(data) {
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }
  return data.slice(0, 1);
}

function normalizeProjects(data) {
  const limitedProjects = limitProjectsToSingle(data);
  if (limitedProjects.length === 0) {
    return [];
  }
  return limitedProjects.map((project, projectIndex) => {
    const startDate = project.startDate || new Date().toISOString();
    const endDate = project.endDate || startDate;
    const streams = Array.isArray(project.streams)
      ? project.streams.map((stream, streamIndex) => ({
          id: stream.id || `stream-${Date.now()}-${projectIndex}-${streamIndex}`,
          label: stream.label || '未命名流程',
          startDate: stream.startDate || startDate,
          endDate: stream.endDate || endDate,
          deadlines: Array.isArray(stream.deadlines) ? stream.deadlines : [],
          color: typeof stream.color === 'number' && stream.color >= 0 && stream.color < STREAM_COLOR_PRESETS.length
            ? stream.color
            : (streamIndex % STREAM_COLOR_PRESETS.length) // 为旧数据分配默认颜色
        }))
      : [];
    return {
      id: project.id || `project-${Date.now()}-${projectIndex}`,
      name: project.name || '未命名项目',
      startDate,
      endDate,
      progress: typeof project.progress === 'number' ? project.progress : 0,
      notes: project.notes || '',
      streams
    };
  });
}

function getSampleProjects() {
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * MS_PER_DAY);
  return [
    {
      id: 'project-sample-1',
      name: 'AI Copilot 试点',
      startDate: new Date(now.getTime() - 7 * MS_PER_DAY).toISOString(),
      endDate: nextMonth.toISOString(),
      progress: 0.55,
      streams: [
        {
          id: 'stream-sample-1',
          label: '研发',
          startDate: new Date(now.getTime() - 7 * MS_PER_DAY).toISOString(),
          endDate: new Date(now.getTime() + 14 * MS_PER_DAY).toISOString()
        },
        {
          id: 'stream-sample-2',
          label: '客户验证',
          startDate: new Date(now.getTime() + 5 * MS_PER_DAY).toISOString(),
          endDate: new Date(now.getTime() + 28 * MS_PER_DAY).toISOString()
        }
      ]
    }
  ];
}

function saveProjects(updatedProjects, options = {}) {
  projects = limitProjectsToSingle(updatedProjects);
  chrome.storage.sync.set({ projects }, () => {
    if (!options.silent) {
      renderProjects();
    }
  });
}

function renderProjects() {
  if (!projectList) return;
  projectList.innerHTML = '';
  if (!projects || projects.length === 0) {
    if (projectEmptyState) {
      projectEmptyState.classList.add('show');
    }
    return;
  }
  if (projectEmptyState) {
    projectEmptyState.classList.remove('show');
  }
  const { windowStart, windowEnd } = getTimelineWindow();
  projects.forEach(project => {
    projectList.appendChild(createProjectTimelineBlock(project, windowStart, windowEnd));
  });
}

// Stock functions
let isUpdatingStocks = false;

function saveStocks() {
  chrome.storage.sync.set({ stocks }, () => {
    if (!isUpdatingStocks) {
      renderStocks();
    }
  });
}

function renderStocks(shouldUpdate = false) {
  if (!stockList) return;
  stockList.innerHTML = '';
  
  if (!stocks || stocks.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'stock-empty';
    emptyDiv.textContent = '暂无股票，点击 + 添加';
    stockList.appendChild(emptyDiv);
    return;
  }
  
  // 渲染每个股票项
  stocks.forEach(stock => {
    const stockItem = createStockItem(stock);
    stockList.appendChild(stockItem);
  });
  
  // 只有在明确需要更新时才更新股票数据
  if (shouldUpdate && !isUpdatingStocks) {
    updateAllStocks();
  }
}

function createStockItem(stock) {
  const item = document.createElement('div');
  item.className = 'stock-item';
  item.dataset.symbol = stock.symbol;
  
  const info = document.createElement('div');
  info.className = 'stock-item-info';
  
  const symbol = document.createElement('div');
  symbol.className = 'stock-symbol';
  symbol.textContent = stock.symbol || 'N/A';
  
  info.appendChild(symbol);
  
  const priceInfo = document.createElement('div');
  priceInfo.className = 'stock-price-info';
  
  const price = document.createElement('div');
  price.className = 'stock-price';
  price.textContent = stock.price ? `$${parseFloat(stock.price).toFixed(1)}` : '--';
  
  // 涨跌幅和 YTD/WTD 放在同一行
  const changeRow = document.createElement('div');
  changeRow.className = 'stock-change-row';
  
  const change = document.createElement('span');
  change.className = 'stock-change';
  if (stock.change !== undefined && stock.changePercent !== undefined) {
    const changeValue = parseFloat(stock.change);
    const changePercent = parseFloat(stock.changePercent);
    change.textContent = `${changeValue >= 0 ? '+' : ''}${changeValue.toFixed(1)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}%)`;
    change.classList.add(changeValue > 0 ? 'positive' : changeValue < 0 ? 'negative' : 'neutral');
  } else {
    change.textContent = '--';
    change.classList.add('neutral');
  }
  
  // YTD 和 WTD
  let ytdText = '';
  let wtdText = '';
  
  if (stock.ytdPercent !== undefined) {
    const ytdValue = parseFloat(stock.ytdPercent);
    ytdText = `YTD: ${ytdValue >= 0 ? '+' : ''}${ytdValue.toFixed(1)}%`;
  } else {
    ytdText = 'YTD: --';
  }
  
  if (stock.wtdPercent !== undefined) {
    const wtdValue = parseFloat(stock.wtdPercent);
    wtdText = `WTD: ${wtdValue >= 0 ? '+' : ''}${wtdValue.toFixed(1)}%`;
  } else {
    wtdText = 'WTD: --';
  }
  
  const ytdWtd = document.createElement('span');
  ytdWtd.className = 'stock-ytd-wtd';
  ytdWtd.textContent = ` | ${ytdText} | ${wtdText}`;
  
  changeRow.appendChild(change);
  changeRow.appendChild(ytdWtd);
  
  priceInfo.appendChild(price);
  priceInfo.appendChild(changeRow);
  
  const actions = document.createElement('div');
  actions.className = 'stock-item-actions';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'stock-delete-btn';
  deleteBtn.textContent = '×';
  deleteBtn.title = '删除';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeStock(stock.symbol);
  });
  
  actions.appendChild(deleteBtn);
  
  item.appendChild(info);
  item.appendChild(priceInfo);
  item.appendChild(actions);
  
  // 添加拖拽排序功能
  item.addEventListener('pointerdown', (event) => handleStockPointerDown(event));
  item.style.cursor = 'grab';
  
  return item;
}

async function fetchStockData(symbol) {
  try {
    const symbolUpper = symbol.toUpperCase();
    
    // 获取当前数据
    const currentResponse = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbolUpper}?interval=1d&range=1d`);
    if (!currentResponse.ok) {
      throw new Error('Failed to fetch stock data');
    }
    const currentData = await currentResponse.json();
    
    if (!currentData.chart || !currentData.chart.result || currentData.chart.result.length === 0) {
      throw new Error('Invalid stock symbol');
    }
    
    const currentResult = currentData.chart.result[0];
    const meta = currentResult.meta;
    const currentPrice = meta.regularMarketPrice || meta.previousClose || 0;
    const previousClose = meta.previousClose || currentPrice;
    const change = currentPrice - previousClose;
    const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;
    
    // 获取年初数据（YTD）- 获取1年的数据，找到年初价格
    let ytdPercent = 0;
    try {
      const ytdResponse = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbolUpper}?interval=1d&range=1y`);
      if (ytdResponse.ok) {
        const ytdData = await ytdResponse.json();
        if (ytdData.chart && ytdData.chart.result && ytdData.chart.result.length > 0) {
          const ytdResult = ytdData.chart.result[0];
          const timestamps = ytdResult.timestamp || [];
          const quotes = ytdResult.indicators?.quote?.[0];
          
          if (timestamps.length > 0 && quotes && quotes.close) {
            // 找到年初（1月1日）的价格
            const now = new Date();
            const yearStart = new Date(now.getFullYear(), 0, 1).getTime() / 1000;
            
            // 找到最接近年初的时间戳
            let ytdStartPrice = null;
            for (let i = 0; i < timestamps.length; i++) {
              if (timestamps[i] >= yearStart) {
                ytdStartPrice = quotes.close[i] || quotes.close[i - 1];
                break;
              }
            }
            
            // 如果没找到，使用第一个数据点
            if (ytdStartPrice === null && quotes.close.length > 0) {
              ytdStartPrice = quotes.close[0];
            }
            
            if (ytdStartPrice && ytdStartPrice > 0) {
              ytdPercent = ((currentPrice - ytdStartPrice) / ytdStartPrice) * 100;
            }
          }
        }
      }
    } catch (e) {
      console.log('YTD calculation failed:', e);
    }
    
    // 获取本周开始数据（WTD）- 获取1个月的数据，找到本周一价格
    let wtdPercent = 0;
    try {
      const wtdResponse = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbolUpper}?interval=1d&range=1mo`);
      if (wtdResponse.ok) {
        const wtdData = await wtdResponse.json();
        if (wtdData.chart && wtdData.chart.result && wtdData.chart.result.length > 0) {
          const wtdResult = wtdData.chart.result[0];
          const timestamps = wtdResult.timestamp || [];
          const quotes = wtdResult.indicators?.quote?.[0];
          
          if (timestamps.length > 0 && quotes && quotes.close) {
            // 找到本周一的价格
            const now = new Date();
            const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
            const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            const monday = new Date(now);
            monday.setDate(now.getDate() - daysToMonday);
            monday.setHours(0, 0, 0, 0);
            const mondayTimestamp = monday.getTime() / 1000;
            
            // 找到最接近周一的时间戳
            let wtdStartPrice = null;
            for (let i = 0; i < timestamps.length; i++) {
              if (timestamps[i] >= mondayTimestamp) {
                wtdStartPrice = quotes.close[i] || quotes.close[i - 1];
                break;
              }
            }
            
            // 如果没找到，使用第一个数据点
            if (wtdStartPrice === null && quotes.close.length > 0) {
              wtdStartPrice = quotes.close[0];
            }
            
            if (wtdStartPrice && wtdStartPrice > 0) {
              wtdPercent = ((currentPrice - wtdStartPrice) / wtdStartPrice) * 100;
            }
          }
        }
      }
    } catch (e) {
      console.log('WTD calculation failed:', e);
    }
    
    return {
      symbol: symbolUpper,
      name: meta.longName || meta.shortName || symbolUpper,
      price: currentPrice,
      change: change,
      changePercent: changePercent,
      ytdPercent: ytdPercent,
      wtdPercent: wtdPercent,
      lastUpdate: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching stock data:', error);
    // 返回模拟数据作为后备
    return {
      symbol: symbol.toUpperCase(),
      name: symbol.toUpperCase(),
      price: 0,
      change: 0,
      changePercent: 0,
      ytdPercent: 0,
      wtdPercent: 0,
      lastUpdate: new Date().toISOString()
    };
  }
}

async function updateAllStocks() {
  if (!stocks || stocks.length === 0 || isUpdatingStocks) return;
  
  isUpdatingStocks = true;
  
  try {
    // 更新所有股票数据
    const updatePromises = stocks.map(async (stock) => {
      const updatedData = await fetchStockData(stock.symbol);
      return {
        ...stock,
        ...updatedData
      };
    });
    
    const updatedStocks = await Promise.all(updatePromises);
    stocks = updatedStocks;
    chrome.storage.sync.set({ stocks }, () => {
      renderStocks();
      isUpdatingStocks = false;
    });
  } catch (error) {
    console.error('Error updating stocks:', error);
    isUpdatingStocks = false;
    renderStocks();
  }
}

function addStock() {
  const symbol = prompt('');
  if (!symbol || !symbol.trim()) {
    return;
  }
  
  const symbolUpper = symbol.trim().toUpperCase();
  
  // 检查是否已存在
  if (stocks.some(s => s.symbol === symbolUpper)) {
    return;
  }
  
  // 添加新股票
  const newStock = {
    symbol: symbolUpper,
    name: symbolUpper,
    price: 0,
    change: 0,
    changePercent: 0,
    lastUpdate: new Date().toISOString()
  };
  
  stocks.push(newStock);
  saveStocks();
  
  // 立即获取数据
  fetchStockData(symbolUpper).then(data => {
    const index = stocks.findIndex(s => s.symbol === symbolUpper);
    if (index !== -1) {
      stocks[index] = { ...stocks[index], ...data };
      saveStocks();
    }
  });
}

function removeStock(symbol) {
  stocks = stocks.filter(s => s.symbol !== symbol);
  saveStocks();
}

// 股票拖拽排序处理函数
function handleStockPointerDown(event) {
  // 忽略非左键点击和删除按钮点击
  if (event.button !== 0 && event.pointerType !== 'touch') return;
  if (event.target.closest('.stock-delete-btn')) return;
  
  const stockItem = event.currentTarget;
  const symbol = stockItem.dataset.symbol;
  const stockList = stockItem.parentElement;
  const allStocks = Array.from(stockList.querySelectorAll('.stock-item'));
  const initialIndex = allStocks.indexOf(stockItem);
  
  if (initialIndex === -1) return;
  
  stockItem.setPointerCapture(event.pointerId);
  
  const rect = stockItem.getBoundingClientRect();
  const initialTop = rect.top;
  const pointerStartY = event.clientY;
  
  activeStockInteraction = {
    node: stockItem,
    symbol: symbol,
    initialIndex: initialIndex,
    targetIndex: initialIndex,
    pointerId: event.pointerId,
    pointerStartY: pointerStartY,
    initialTop: initialTop,
    isDragging: false
  };
  
  // 添加全局事件监听器
  document.addEventListener('pointermove', handleStockPointerMove);
  document.addEventListener('pointerup', handleStockPointerUp);
  
  event.preventDefault();
}

function handleStockPointerMove(event) {
  if (!activeStockInteraction) return;
  const interaction = activeStockInteraction;
  
  const deltaY = event.clientY - interaction.pointerStartY;
  const absDeltaY = Math.abs(deltaY);
  
  // 如果移动距离超过10px，开始拖拽
  if (!interaction.isDragging && absDeltaY > 10) {
    interaction.isDragging = true;
    interaction.node.classList.add('dragging');
    interaction.node.style.cursor = 'grabbing';
  }
  
  if (!interaction.isDragging) return;
  
  const stockList = interaction.node.parentElement;
  const allStocks = Array.from(stockList.querySelectorAll('.stock-item'));
  
  // 计算每个股票项的高度（包括gap）
  const firstItemRect = allStocks[0]?.getBoundingClientRect();
  const secondItemRect = allStocks[1]?.getBoundingClientRect();
  const itemHeight = firstItemRect && secondItemRect 
    ? secondItemRect.top - firstItemRect.top 
    : interaction.node.offsetHeight + 6;
  
  const stockListRect = stockList.getBoundingClientRect();
  const currentY = interaction.initialTop + deltaY;
  
  // 计算目标索引
  const relativeY = currentY - stockListRect.top;
  const targetIndex = Math.round(relativeY / itemHeight);
  const clampedIndex = Math.max(0, Math.min(targetIndex, allStocks.length - 1));
  
  if (clampedIndex !== interaction.targetIndex) {
    interaction.targetIndex = clampedIndex;
  }
  
  // 更新所有股票项的位置
  allStocks.forEach((item, index) => {
    if (item === interaction.node) {
      // 被拖拽的股票项跟随鼠标
      item.style.transform = `translateY(${deltaY}px)`;
      item.style.zIndex = '1000';
      item.style.opacity = '0.8';
    } else {
      // 其他股票项根据目标位置调整
      let adjustedIndex = index;
      const initialIndex = interaction.initialIndex;
      const targetIndex = interaction.targetIndex;
      
      if (targetIndex > initialIndex) {
        // 向下移动：初始位置之后、目标位置之前的股票项向上移动
        if (index > initialIndex && index <= targetIndex) {
          adjustedIndex = index - 1;
        }
      } else if (targetIndex < initialIndex) {
        // 向上移动：目标位置之后、初始位置之前的股票项向下移动
        if (index >= targetIndex && index < initialIndex) {
          adjustedIndex = index + 1;
        }
      }
      
      item.style.transform = `translateY(${(adjustedIndex - index) * itemHeight}px)`;
      item.style.transition = 'transform 0.2s ease';
    }
  });
}

function handleStockPointerUp(event) {
  if (!activeStockInteraction) return;
  const interaction = activeStockInteraction;
  
  // 移除全局事件监听器
  document.removeEventListener('pointermove', handleStockPointerMove);
  document.removeEventListener('pointerup', handleStockPointerUp);
  
  if (interaction.node.hasPointerCapture(interaction.pointerId)) {
    interaction.node.releasePointerCapture(interaction.pointerId);
  }
  
  const stockList = interaction.node.parentElement;
  const allStocks = Array.from(stockList.querySelectorAll('.stock-item'));
  
  // 恢复所有股票项的样式
  allStocks.forEach(item => {
    item.style.transform = '';
    item.style.transition = '';
    item.style.zIndex = '';
    item.style.opacity = '';
    item.style.cursor = 'grab';
  });
  
  interaction.node.classList.remove('dragging');
  
  // 如果改变了位置，应用排序
  if (interaction.isDragging && interaction.targetIndex !== interaction.initialIndex) {
    reorderStocks(interaction.symbol, interaction.targetIndex);
  }
  
  activeStockInteraction = null;
}

// 重新排序股票列表
function reorderStocks(symbol, targetIndex) {
  const currentIndex = stocks.findIndex(s => s.symbol === symbol);
  
  if (currentIndex === -1 || currentIndex === targetIndex) return;
  
  // 创建新的数组并重新排序
  const newStocks = [...stocks];
  const [movedStock] = newStocks.splice(currentIndex, 1);
  newStocks.splice(targetIndex, 0, movedStock);
  
  stocks = newStocks;
  saveStocks();
}

function createProjectTimelineBlock(project, windowStart, windowEnd) {
  const block = document.createElement('div');
  block.className = 'project-timeline-block';
  block.dataset.projectId = project.id;
  const timeline = document.createElement('div');
  timeline.className = 'project-timeline';

  const timelineGrid = document.createElement('div');
  timelineGrid.className = 'timeline-grid';
  timelineGrid.style.setProperty('--timeline-weeks', timelineRangeWeeks);

  const weekLabels = buildWeekLabels(windowStart, timelineRangeWeeks);
  weekLabels.forEach(label => {
    const column = document.createElement('div');
    column.className = 'timeline-column';
    column.textContent = label;
    timelineGrid.appendChild(column);
  });

  const timelineStreams = document.createElement('div');
  timelineStreams.className = 'timeline-streams';
  const streams = Array.isArray(project.streams) ? project.streams : [];
  const height = Math.max(streams.length * 36, 60); // 增加最小高度，确保可以点击
  timelineStreams.style.height = `${height}px`;
  timelineStreams.style.minHeight = '60px'; // 确保最小高度
  timelineStreams.dataset.windowStart = windowStart.toISOString();
  timelineStreams.dataset.windowEnd = windowEnd.toISOString();

  streams.forEach((stream, index) => {
    const streamNode = createTimelineStream(stream, index, windowStart, windowEnd, project.id);
    timelineStreams.appendChild(streamNode);
    
    // 在流程条外侧添加删除按钮
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'stream-delete-btn-inline';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = '删除流程条';
    deleteBtn.dataset.streamId = stream.id;
    deleteBtn.dataset.projectId = project.id;
    deleteBtn.dataset.streamIndex = index;
    deleteBtn.style.top = `${index * 36}px`;
    deleteBtn.style.right = '-12px'; // 放在流程条右侧外侧
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeStream(project.id, stream.id);
    });
    // 阻止删除按钮的拖拽事件
    deleteBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    deleteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    
    // 监听流程条悬停，显示/隐藏删除按钮
    streamNode.addEventListener('mouseenter', () => {
      deleteBtn.style.opacity = '1';
      deleteBtn.style.pointerEvents = 'auto';
    });
    streamNode.addEventListener('mouseleave', () => {
      deleteBtn.style.opacity = '0';
      deleteBtn.style.pointerEvents = 'none';
    });
    
    timelineStreams.appendChild(deleteBtn);
  });

  timeline.appendChild(timelineGrid);
  timeline.appendChild(timelineStreams);

  // 添加右键菜单事件，支持在任意位置添加小红旗
  // 在 timeline 容器上监听，这样可以捕获所有区域（包括 timeline-grid 和 timeline-streams）
  console.log('📌 为 timeline 添加右键事件监听器', {
    projectId: project.id,
    timelineElement: timeline,
    timelineClassName: timeline.className
  });
  
  timeline.addEventListener('contextmenu', (event) => {
    console.log('=== Timeline 右键事件触发 ===', {
      target: event.target,
      targetClassName: event.target.className,
      targetTagName: event.target.tagName,
      currentTarget: event.currentTarget,
      currentTargetClassName: event.currentTarget.className,
      clientX: event.clientX,
      clientY: event.clientY
    });
    
    // 忽略在交互元素上的右键
    if (event.target.closest('.timeline-stream-label') ||
        event.target.closest('.stream-handle') ||
        event.target.closest('.deadline-flag')) {
      console.log('右键被忽略：点击在交互元素上');
      return;
    }
    
    // 检查点击是否在 timeline-streams 区域内（不包括 timeline-grid）
    const streamsRect = timelineStreams.getBoundingClientRect();
    const clickX = event.clientX;
    const clickY = event.clientY;
    
    console.log('📍 检查点击位置', {
      clickX,
      clickY,
      streamsRect: {
        left: streamsRect.left,
        right: streamsRect.right,
        top: streamsRect.top,
        bottom: streamsRect.bottom
      },
      inStreamsArea: clickX >= streamsRect.left && clickX <= streamsRect.right && 
                     clickY >= streamsRect.top && clickY <= streamsRect.bottom
    });
    
    if (clickX >= streamsRect.left && clickX <= streamsRect.right && 
        clickY >= streamsRect.top && clickY <= streamsRect.bottom) {
      console.log('✅ 点击在 timeline-streams 区域内，处理右键事件');
      event.preventDefault();
      event.stopPropagation();
      handleTimelineRightClick(event, timelineStreams, windowStart, windowEnd, project.id);
    } else {
      console.log('❌ 点击不在 timeline-streams 区域内（可能在 timeline-grid 区域）');
    }
  }, true); // 使用捕获阶段确保能捕获事件

  block.appendChild(timeline);
  return block;
}

function createTimelineStream(stream, index, windowStart, windowEnd, projectId) {
  const streamNode = document.createElement('div');
  streamNode.className = 'timeline-stream';
  streamNode.dataset.streamId = stream.id;
  streamNode.dataset.projectId = projectId;

  const startDate = stream.startDate ? new Date(stream.startDate) : new Date(windowStart);
  const endDate = stream.endDate ? new Date(stream.endDate) : new Date(startDate);

  streamNode.style.top = `${index * 36}px`;

  const startHandle = document.createElement('span');
  startHandle.className = 'stream-handle stream-handle-start';
  startHandle.title = '拖拽调整开始日期';

  const endHandle = document.createElement('span');
  endHandle.className = 'stream-handle stream-handle-end';
  endHandle.title = '拖拽调整结束日期';

  const content = document.createElement('div');
  content.className = 'timeline-stream-content';

  const labelEl = document.createElement('span');
  labelEl.className = 'timeline-stream-label';
  labelEl.textContent = stream.label || '未命名流程';
  labelEl.contentEditable = 'true';
  labelEl.spellcheck = false;
  labelEl.addEventListener('mousedown', (event) => event.stopPropagation());
  labelEl.addEventListener('pointerdown', (event) => event.stopPropagation());
  labelEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      labelEl.blur();
    }
  });
  labelEl.addEventListener('blur', () => {
    const nextLabel = (labelEl.textContent || '').trim() || '未命名流程';
    labelEl.textContent = nextLabel;
    handleStreamLabelChange(projectId, stream.id, nextLabel);
  });

  const rangeEl = document.createElement('span');
  rangeEl.className = 'timeline-stream-range';

  content.appendChild(labelEl);
  content.appendChild(rangeEl);

  streamNode.appendChild(startHandle);
  streamNode.appendChild(content);
  streamNode.appendChild(endHandle);


  // 应用流程条颜色（如果stream.color无效，使用默认值0，而不是index，避免排序后颜色变化）
  const colorIndex = typeof stream.color === 'number' && stream.color >= 0 && stream.color < STREAM_COLOR_PRESETS.length
    ? stream.color
    : 0;
  applyStreamColor(streamNode, colorIndex);

  setTimelineStreamPosition(streamNode, startDate, endDate, windowStart, windowEnd);
  updateStreamRangeLabel(streamNode, startDate, endDate);

  streamNode.addEventListener('pointerdown', (event) => handleStreamPointerDown(event, windowStart, windowEnd));

  // 渲染已有的小红旗
  renderDeadlineFlags(streamNode, stream.deadlines || [], windowStart, windowEnd, projectId, stream.id);

  return streamNode;
}

// 应用流程条颜色
function applyStreamColor(streamNode, colorIndex, fallbackIndex = 0) {
  const colorIndexNum = typeof colorIndex === 'number' && colorIndex >= 0 && colorIndex < STREAM_COLOR_PRESETS.length
    ? colorIndex
    : (fallbackIndex % STREAM_COLOR_PRESETS.length);
  const color = STREAM_COLOR_PRESETS[colorIndexNum];
  
  // 应用背景色（半透明）
  streamNode.style.backgroundColor = `rgba(${color.bg}, 0.16)`;
  streamNode.style.color = `rgb(${color.text})`;
  
  // 应用拖拽手柄颜色
  const handles = streamNode.querySelectorAll('.stream-handle');
  handles.forEach(handle => {
    handle.style.backgroundColor = `rgba(${color.handle}, 0.35)`;
  });
  
  // 保存颜色索引到 dataset
  streamNode.dataset.colorIndex = colorIndexNum;
}

function setTimelineStreamPosition(streamNode, startDate, endDate, windowStart, windowEnd) {
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();
  const startMs = startDate.getTime();
  const endMs = Math.max(startMs + STREAM_MIN_DURATION_MS, endDate.getTime());
  const clampedStart = Math.max(startMs, windowStartMs);
  const clampedEnd = Math.max(clampedStart + STREAM_MIN_DURATION_MS, Math.min(endMs, windowEndMs));
  const total = windowEndMs - windowStartMs;
  const leftPct = total > 0 ? ((clampedStart - windowStartMs) / total) * 100 : 0;
  const widthPct = total > 0 ? ((clampedEnd - clampedStart) / total) * 100 : 0;
  streamNode.style.left = `${clamp(leftPct, 0, 100)}%`;
  streamNode.style.width = `${Math.max(widthPct, 1)}%`;
  streamNode.dataset.startDate = new Date(startMs).toISOString();
  streamNode.dataset.endDate = new Date(endMs).toISOString();
}

function updateStreamRangeLabel(streamNode, startDate, endDate) {
  const rangeEl = streamNode.querySelector('.timeline-stream-range');
  if (rangeEl) {
    rangeEl.textContent = formatProjectRange(startDate, endDate);
  }
  // 更新小红旗位置
  updateDeadlineFlagsPosition(streamNode);
}

function updateDeadlineFlagsPosition(streamNode) {
  const streamId = streamNode.dataset.streamId;
  if (!streamId) return;
  
  const timeline = streamNode.parentElement;
  if (!timeline) return;
  
  const flags = timeline.querySelectorAll(`.deadline-flag[data-stream-id="${streamId}"]`);
  if (flags.length === 0) return;
  
  // 使用requestAnimationFrame确保在DOM更新后获取准确位置
  requestAnimationFrame(() => {
    const streamTop = streamNode.offsetTop || 0;
    flags.forEach(flag => {
      flag.style.top = `${streamTop - 20}px`;
    });
  });
}

function handleStreamLabelChange(projectId, streamId, nextLabel) {
  const finalLabel = nextLabel && nextLabel.trim() ? nextLabel.trim() : '未命名流程';
  const updatedProjects = projects.map(project => {
    if (project.id !== projectId) return project;
    return {
      ...project,
      streams: (project.streams || []).map(stream => {
        if (stream.id !== streamId) return stream;
        return {
          ...stream,
          label: finalLabel
        };
      })
    };
  });
  saveProjects(updatedProjects, { silent: true });
}

function handleStreamPointerDown(event, windowStart, windowEnd) {
  if (event.button !== 0 && event.pointerType !== 'touch') {
    return;
  }
  const streamNode = event.currentTarget;
  const projectId = streamNode?.dataset?.projectId;
  const streamId = streamNode?.dataset?.streamId;
  if (!streamNode || !projectId || !streamId) return;

  const interactingLabel = event.target.closest('.timeline-stream-label');
  if (interactingLabel) {
    return;
  }

  const timeline = streamNode.parentElement;
  if (!timeline) return;
  const rect = timeline.getBoundingClientRect();
  const totalWindowMs = windowEnd.getTime() - windowStart.getTime();
  if (rect.width <= 0 || totalWindowMs <= 0) return;

  const msPerPixel = totalWindowMs / rect.width;
  if (!Number.isFinite(msPerPixel)) return;

  const startHandle = event.target.closest('.stream-handle-start');
  const endHandle = event.target.closest('.stream-handle-end');
  const mode = startHandle ? 'resize-start' : endHandle ? 'resize-end' : 'move';

  const startMs = new Date(streamNode.dataset.startDate).getTime();
  const endMs = new Date(streamNode.dataset.endDate).getTime();

  // 计算当前流程条的索引位置
  const timelineStreams = timeline;
  const allStreams = Array.from(timelineStreams.querySelectorAll('.timeline-stream'));
  const currentIndex = allStreams.indexOf(streamNode);
  const initialTop = parseFloat(streamNode.style.top) || (currentIndex * 36);

  activeStreamInteraction = {
    node: streamNode,
    projectId,
    streamId,
    mode,
    pointerId: event.pointerId,
    pointerStartX: event.clientX,
    pointerStartY: event.clientY,
    msPerPixel,
    windowStart,
    windowEnd,
    initialStartMs: startMs,
    initialEndMs: endMs,
    durationMs: Math.max(endMs - startMs, STREAM_MIN_DURATION_MS),
    initialIndex: currentIndex,
    initialTop: initialTop,
    isSorting: false, // 是否进入排序模式
    targetIndex: currentIndex // 目标索引位置
  };

  streamNode.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function handleStreamPointerMove(event) {
  if (!activeStreamInteraction) return;
  const interaction = activeStreamInteraction;
  const deltaX = event.clientX - interaction.pointerStartX;
  const deltaY = event.clientY - interaction.pointerStartY;
  const deltaPx = deltaX;
  const deltaMs = deltaPx * interaction.msPerPixel;
  const windowStartMs = interaction.windowStart.getTime();
  const windowEndMs = interaction.windowEnd.getTime();

  // 如果点击的不是手柄，检测是否应该进入排序模式
  if (interaction.mode === 'move' && !interaction.isSorting) {
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);
    // 如果垂直移动超过水平移动，且超过阈值（10px），进入排序模式
    if (absDeltaY > absDeltaX && absDeltaY > 10) {
      interaction.isSorting = true;
      interaction.node.classList.add('sorting');
    }
  }

  // 排序模式：上下拖拽重新排序
  if (interaction.isSorting) {
    const timelineStreams = interaction.node.parentElement;
    const allStreams = Array.from(timelineStreams.querySelectorAll('.timeline-stream'));
    const currentY = interaction.initialTop + deltaY;
    
    // 计算目标索引（每36px一行）
    const targetIndex = Math.round(currentY / 36);
    const clampedIndex = Math.max(0, Math.min(targetIndex, allStreams.length - 1));
    
    if (clampedIndex !== interaction.targetIndex) {
      interaction.targetIndex = clampedIndex;
    }
    
    // 更新所有流程条和删除按钮的位置
    const allDeleteBtns = Array.from(timelineStreams.querySelectorAll('.stream-delete-btn-inline'));
    allStreams.forEach((stream, index) => {
      const streamId = stream.dataset.streamId;
      const deleteBtn = allDeleteBtns.find(btn => btn.dataset.streamId === streamId);
      
      if (stream === interaction.node) {
        // 被拖拽的流程条跟随鼠标
        stream.style.top = `${currentY}px`;
        if (deleteBtn) {
          deleteBtn.style.top = `${currentY}px`;
        }
      } else {
        // 其他流程条根据目标位置调整
        let adjustedIndex = index;
        const initialIndex = interaction.initialIndex;
        const targetIndex = interaction.targetIndex;
        
        if (targetIndex > initialIndex) {
          // 向下移动：初始位置之后、目标位置之前的流程条向上移动
          if (index > initialIndex && index <= targetIndex) {
            adjustedIndex = index - 1;
          }
        } else if (targetIndex < initialIndex) {
          // 向上移动：目标位置之后、初始位置之前的流程条向下移动
          if (index >= targetIndex && index < initialIndex) {
            adjustedIndex = index + 1;
          }
        }
        stream.style.top = `${adjustedIndex * 36}px`;
        if (deleteBtn) {
          deleteBtn.style.top = `${adjustedIndex * 36}px`;
        }
      }
    });
    
    interaction.node.classList.add('dragging');
    return;
  }

  // 原有的时间轴移动逻辑
  let nextStartMs = interaction.initialStartMs;
  let nextEndMs = interaction.initialEndMs;

  if (interaction.mode === 'move') {
    nextStartMs = interaction.initialStartMs + deltaMs;
    nextEndMs = interaction.initialEndMs + deltaMs;
    const duration = interaction.durationMs;
    if (nextStartMs < windowStartMs) {
      nextStartMs = windowStartMs;
      nextEndMs = windowStartMs + duration;
    }
    if (nextEndMs > windowEndMs) {
      nextEndMs = windowEndMs;
      nextStartMs = windowEndMs - duration;
    }
  } else if (interaction.mode === 'resize-start') {
    const absoluteMaxStart = Math.min(
      interaction.initialEndMs - STREAM_MIN_DURATION_MS,
      windowEndMs - STREAM_MIN_DURATION_MS
    );
    const maxStart = Math.max(windowStartMs, absoluteMaxStart);
    nextStartMs = clamp(interaction.initialStartMs + deltaMs, windowStartMs, maxStart);
  } else if (interaction.mode === 'resize-end') {
    const absoluteMinEnd = Math.max(
      interaction.initialStartMs + STREAM_MIN_DURATION_MS,
      windowStartMs + STREAM_MIN_DURATION_MS
    );
    const minEnd = Math.min(absoluteMinEnd, windowEndMs);
    nextEndMs = clamp(interaction.initialEndMs + deltaMs, minEnd, windowEndMs);
  }

  if (nextStartMs >= nextEndMs) {
    nextEndMs = Math.min(windowEndMs, nextStartMs + STREAM_MIN_DURATION_MS);
    nextStartMs = Math.max(windowStartMs, nextEndMs - STREAM_MIN_DURATION_MS);
  }

  const nextStartDate = new Date(nextStartMs);
  const nextEndDate = new Date(nextEndMs);

  setTimelineStreamPosition(interaction.node, nextStartDate, nextEndDate, interaction.windowStart, interaction.windowEnd);
  updateStreamRangeLabel(interaction.node, nextStartDate, nextEndDate);

  interaction.pendingStartMs = nextStartMs;
  interaction.pendingEndMs = nextEndMs;
  interaction.node.classList.add('dragging');
}

function handleStreamPointerUp() {
  if (!activeStreamInteraction) return;
  const interaction = activeStreamInteraction;
  if (interaction.node.hasPointerCapture(interaction.pointerId)) {
    interaction.node.releasePointerCapture(interaction.pointerId);
  }
  interaction.node.classList.remove('dragging');
  interaction.node.classList.remove('sorting');

  // 如果是排序模式，应用排序
  if (interaction.isSorting) {
    if (interaction.targetIndex !== interaction.initialIndex) {
      reorderStreams(interaction.projectId, interaction.streamId, interaction.targetIndex);
    } else {
      // 如果没有改变位置，恢复所有流程条和删除按钮的位置
      const timelineStreams = interaction.node.parentElement;
      const allStreams = Array.from(timelineStreams.querySelectorAll('.timeline-stream'));
      const allDeleteBtns = Array.from(timelineStreams.querySelectorAll('.stream-delete-btn-inline'));
      allStreams.forEach((stream, index) => {
        stream.style.top = `${index * 36}px`;
        const streamId = stream.dataset.streamId;
        const deleteBtn = allDeleteBtns.find(btn => btn.dataset.streamId === streamId);
        if (deleteBtn) {
          deleteBtn.style.top = `${index * 36}px`;
        }
      });
    }
    activeStreamInteraction = null;
    return;
  }

  // 原有的时间轴更新逻辑
  const finalStartMs = interaction.pendingStartMs ?? interaction.initialStartMs;
  const finalEndMs = interaction.pendingEndMs ?? interaction.initialEndMs;

  if (finalStartMs !== interaction.initialStartMs || finalEndMs !== interaction.initialEndMs) {
    updateStreamDates(
      interaction.projectId,
      interaction.streamId,
      new Date(finalStartMs).toISOString(),
      new Date(finalEndMs).toISOString()
    );
  }

  activeStreamInteraction = null;
}

function updateStreamDates(projectId, streamId, startISO, endISO) {
  const updatedProjects = projects.map(project => {
    if (project.id !== projectId) return project;
    return {
      ...project,
      streams: (project.streams || []).map(stream => {
        if (stream.id !== streamId) return stream;
        return {
          ...stream,
          startDate: startISO,
          endDate: endISO
        };
      })
    };
  });
  saveProjects(updatedProjects);
}

function reorderStreams(projectId, streamId, targetIndex) {
  const updatedProjects = projects.map(project => {
    if (project.id !== projectId) return project;
    const streams = [...(project.streams || [])];
    const currentIndex = streams.findIndex(s => s.id === streamId);
    
    if (currentIndex === -1 || currentIndex === targetIndex) {
      return project;
    }
    
    // 从原位置移除
    const [movedStream] = streams.splice(currentIndex, 1);
    // 插入到新位置
    streams.splice(targetIndex, 0, movedStream);
    
    return {
      ...project,
      streams
    };
  });
  saveProjects(updatedProjects);
}

function handleTimelineRightClick(event, timelineStreams, windowStart, windowEnd, projectId) {
  console.log('handleTimelineRightClick 被调用', event.target);
  
  // 忽略在交互元素上的右键（但允许在流程条主体上右键选择颜色）
  if (event.target.closest('.timeline-stream-label') ||
      event.target.closest('.stream-handle') ||
      event.target.closest('.deadline-flag')) {
    console.log('右键被忽略：点击在交互元素上');
    return;
  }
  
  console.log('处理右键点击');
  const rect = timelineStreams.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;
  const totalWidth = rect.width;
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();
  const totalMs = windowEndMs - windowStartMs;
  
  // 计算点击位置对应的时间
  const clickRatio = Math.max(0, Math.min(1, clickX / totalWidth));
  const clickDate = new Date(windowStartMs + clickRatio * totalMs);
  
  // 找到点击位置对应的流程条（根据Y坐标）
  const streamNodes = Array.from(timelineStreams.querySelectorAll('.timeline-stream'));
  let targetStreamNode = null;
  let targetStreamId = null;
  
  // 检查是否点击在某个流程条上（使用getBoundingClientRect获取准确位置）
  for (const streamNode of streamNodes) {
    const streamRect = streamNode.getBoundingClientRect();
    const streamTop = streamRect.top - rect.top;
    const streamBottom = streamTop + streamRect.height;
    
    if (clickY >= streamTop && clickY <= streamBottom) {
      targetStreamNode = streamNode;
      targetStreamId = streamNode.dataset.streamId;
      break;
    }
  }
  
  // 如果点击在流程条上，显示颜色选择菜单
  if (targetStreamNode && targetStreamId) {
    event.preventDefault();
    showStreamColorMenu(event, targetStreamNode, targetStreamId, projectId);
    return;
  }
  
  // 创建新的deadline对象
  const newDeadline = {
    id: `deadline-${Date.now()}`,
    date: clickDate.toISOString(),
    comment: ''
  };
  
  // 如果没有找到流程条，创建一个新的流程条（包含小红旗）
  if (!targetStreamId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    // 计算新流程条的位置（行号）- 根据点击位置和现有流程条的位置来确定
    let rowIndex = Math.floor(clickY / 36);
    const existingStreams = project.streams || [];
    
    // 确保rowIndex在有效范围内
    rowIndex = Math.max(0, Math.min(rowIndex, existingStreams.length));
    
    // 创建新流程条
    const now = new Date();
    const projectStart = project.startDate ? new Date(project.startDate) : now;
    const fallbackEnd = new Date(projectStart.getTime() + DEFAULT_PROJECT_DURATION_DAYS * MS_PER_DAY);
    const projectEnd = project.endDate ? new Date(project.endDate) : fallbackEnd;
    
    // 以点击日期为中心，创建流程条
    const startMs = Math.max(
      projectStart.getTime(),
      clickDate.getTime() - (DEFAULT_STREAM_DURATION_DAYS * MS_PER_DAY / 2)
    );
    let endMs = Math.min(
      projectEnd.getTime(),
      startMs + DEFAULT_STREAM_DURATION_DAYS * MS_PER_DAY
    );
    if (endMs <= startMs) {
      endMs = startMs + STREAM_MIN_DURATION_MS;
    }
    
    // 为新流程条分配颜色（根据索引循环使用预设颜色）
    const colorIndex = existingStreams.length % STREAM_COLOR_PRESETS.length;
    const newStream = {
      id: createUniqueId('stream'),
      label: '未命名流程',
      startDate: new Date(startMs).toISOString(),
      endDate: new Date(endMs).toISOString(),
      deadlines: [newDeadline], // 直接包含小红旗
      color: colorIndex // 分配颜色
    };
    
    // 插入到指定位置
    const updatedStreams = [...existingStreams];
    updatedStreams.splice(rowIndex, 0, newStream);
    
    const updatedProjects = projects.map(p => {
      if (p.id !== projectId) return p;
      return {
        ...p,
        streams: updatedStreams
      };
    });
    
    saveProjects(updatedProjects);
    return; // 已经完成，直接返回
  }
  
  // 如果找到了流程条，添加新的deadline到该流程条（在流程条上右键但不在交互元素上）
  // 注意：这个分支实际上不会执行，因为如果找到流程条，已经在上面返回了
  // 保留此代码以防逻辑变化
  if (targetStreamId) {
    const updatedProjects = projects.map(project => {
      if (project.id !== projectId) return project;
      return {
        ...project,
        streams: (project.streams || []).map(stream => {
          if (stream.id !== targetStreamId) return stream;
          const deadlines = stream.deadlines || [];
          return {
            ...stream,
            deadlines: [...deadlines, newDeadline]
          };
        })
      };
    });
    saveProjects(updatedProjects);
  }
}

// 显示流程条颜色选择菜单
function showStreamColorMenu(event, streamNode, streamId, projectId) {
  // 移除已存在的颜色菜单
  const existingMenu = document.getElementById('streamColorMenu');
  if (existingMenu) {
    existingMenu.remove();
  }
  
  const menu = document.createElement('div');
  menu.id = 'streamColorMenu';
  menu.className = 'stream-color-menu';
  menu.style.position = 'fixed';
  menu.style.zIndex = '10000';
  
  const title = document.createElement('div');
  title.className = 'stream-color-menu-title';
  title.textContent = '选择颜色';
  menu.appendChild(title);
  
  const colorGrid = document.createElement('div');
  colorGrid.className = 'stream-color-grid';
  
  STREAM_COLOR_PRESETS.forEach((color, index) => {
    const colorBtn = document.createElement('button');
    colorBtn.className = 'stream-color-option';
    colorBtn.style.backgroundColor = `rgb(${color.bg})`;
    colorBtn.style.borderColor = `rgb(${color.text})`;
    colorBtn.title = `颜色 ${index + 1}`;
    
    // 标记当前颜色
    const currentColorIndex = parseInt(streamNode.dataset.colorIndex || '0', 10);
    if (index === currentColorIndex) {
      colorBtn.classList.add('active');
      colorBtn.innerHTML = '✓';
    }
    
    colorBtn.addEventListener('click', () => {
      updateStreamColor(projectId, streamId, index);
      menu.remove();
    });
    
    colorGrid.appendChild(colorBtn);
  });
  
  menu.appendChild(colorGrid);
  
  // 添加删除按钮
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'stream-delete-btn';
  deleteBtn.textContent = '删除流程条';
  deleteBtn.addEventListener('click', () => {
    menu.remove();
    removeStream(projectId, streamId);
  });
  menu.appendChild(deleteBtn);
  
  document.body.appendChild(menu);
  
  // 计算菜单位置，确保不超出窗口边界
  const menuRect = menu.getBoundingClientRect();
  const windowWidth = window.innerWidth || document.documentElement.clientWidth;
  const windowHeight = window.innerHeight || document.documentElement.clientHeight;
  const menuWidth = menuRect.width;
  const menuHeight = menuRect.height;
  
  let left = event.clientX;
  let top = event.clientY;
  
  // 如果右侧超出，向左调整
  if (left + menuWidth > windowWidth) {
    left = windowWidth - menuWidth - 10; // 留10px边距
  }
  
  // 如果底部超出，向上调整
  if (top + menuHeight > windowHeight) {
    top = windowHeight - menuHeight - 10; // 留10px边距
  }
  
  // 确保不超出左边界和上边界
  left = Math.max(10, left);
  top = Math.max(10, top);
  
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  
  // 点击外部关闭菜单
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('contextmenu', closeMenu);
    }
  };
  
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
    document.addEventListener('contextmenu', closeMenu);
  }, 0);
}

// 更新流程条颜色
function updateStreamColor(projectId, streamId, colorIndex) {
  const updatedProjects = projects.map(project => {
    if (project.id !== projectId) return project;
    return {
      ...project,
      streams: (project.streams || []).map(stream => {
        if (stream.id !== streamId) return stream;
        return {
          ...stream,
          color: colorIndex
        };
      })
    };
  });
  saveProjects(updatedProjects);
  
  // 立即更新UI
  const streamNode = document.querySelector(`.timeline-stream[data-stream-id="${streamId}"]`);
  if (streamNode) {
    applyStreamColor(streamNode, colorIndex);
  }
}

function renderDeadlineFlags(streamNode, deadlines, windowStart, windowEnd, projectId, streamId) {
  // 清除已有的小红旗（通过data属性查找）
  const timeline = streamNode.parentElement;
  if (timeline) {
    timeline.querySelectorAll(`.deadline-flag[data-stream-id="${streamId}"]`).forEach(flag => flag.remove());
  }
  
  if (!timeline) return;
  
  deadlines.forEach(deadline => {
    const flag = createDeadlineFlag(deadline, windowStart, windowEnd, projectId, streamId, streamNode);
    timeline.appendChild(flag);
  });
}

function createDeadlineFlag(deadline, windowStart, windowEnd, projectId, streamId, streamNode) {
  const flag = document.createElement('div');
  flag.className = 'deadline-flag';
  flag.dataset.deadlineId = deadline.id;
  flag.dataset.projectId = projectId;
  flag.dataset.streamId = streamId;
  
  const flagIcon = document.createElement('img');
  flagIcon.src = 'icon/target.png';
  flagIcon.alt = 'DDL';
  flagIcon.className = 'deadline-flag-icon';
  
  flag.appendChild(flagIcon);
  
  // 计算位置
  const deadlineDate = new Date(deadline.date);
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();
  const totalMs = windowEndMs - windowStartMs;
  const deadlineMs = deadlineDate.getTime();
  
  if (deadlineMs >= windowStartMs && deadlineMs <= windowEndMs) {
    const ratio = (deadlineMs - windowStartMs) / totalMs;
    flag.style.left = `${ratio * 100}%`;
    
    // 根据streamNode的位置设置top（流程条上方）
    // 使用setTimeout确保DOM已渲染
    setTimeout(() => {
      const streamTop = streamNode.offsetTop || 0;
      flag.style.top = `${streamTop - 20}px`;
    }, 0);
  } else {
    flag.style.display = 'none';
  }
  
  // 添加comment提示
  if (deadline.comment) {
    flag.title = deadline.comment;
    flag.classList.add('has-comment');
  } else {
    flag.title = '点击添加备注';
  }
  
  // 点击小红旗添加/编辑comment
  flag.addEventListener('click', (e) => {
    e.stopPropagation();
    showDeadlineCommentEditor(flag, deadline, projectId, streamId);
  });
  
  // 右键删除
  flag.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('确定要删除这个DDL吗？')) {
      removeDeadline(projectId, streamId, deadline.id);
    }
  });
  
  return flag;
}

function showDeadlineCommentEditor(flagElement, deadline, projectId, streamId) {
  // 移除已有的编辑器
  const existingEditor = document.querySelector('.deadline-comment-editor');
  if (existingEditor) {
    existingEditor.remove();
  }
  
  const editor = document.createElement('div');
  editor.className = 'deadline-comment-editor';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'deadline-comment-input';
  input.value = deadline.comment || '';
  input.placeholder = '输入备注...';
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'deadline-comment-save';
  saveBtn.textContent = '保存';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'deadline-comment-cancel';
  cancelBtn.textContent = '取消';
  
  editor.appendChild(input);
  editor.appendChild(saveBtn);
  editor.appendChild(cancelBtn);
  
  // 定位编辑器
  const rect = flagElement.getBoundingClientRect();
  editor.style.left = `${rect.left}px`;
  editor.style.top = `${rect.bottom + 5}px`;
  
  document.body.appendChild(editor);
  input.focus();
  input.select();
  
  const saveComment = () => {
    const comment = input.value.trim();
    updateDeadlineComment(projectId, streamId, deadline.id, comment);
    editor.remove();
  };
  
  const cancel = () => {
    editor.remove();
  };
  
  saveBtn.addEventListener('click', saveComment);
  cancelBtn.addEventListener('click', cancel);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveComment();
    } else if (e.key === 'Escape') {
      cancel();
    }
  });
  
  // 点击外部关闭
  setTimeout(() => {
    const closeOnClickOutside = (e) => {
      if (!editor.contains(e.target) && e.target !== flagElement) {
        editor.remove();
        document.removeEventListener('click', closeOnClickOutside);
      }
    };
    document.addEventListener('click', closeOnClickOutside);
  }, 0);
}

function updateDeadlineComment(projectId, streamId, deadlineId, comment) {
  const updatedProjects = projects.map(project => {
    if (project.id !== projectId) return project;
    return {
      ...project,
      streams: (project.streams || []).map(stream => {
        if (stream.id !== streamId) return stream;
        return {
          ...stream,
          deadlines: (stream.deadlines || []).map(dl => {
            if (dl.id === deadlineId) {
              return { ...dl, comment };
            }
            return dl;
          })
        };
      })
    };
  });
  saveProjects(updatedProjects);
}

function removeDeadline(projectId, streamId, deadlineId) {
  const updatedProjects = projects.map(project => {
    if (project.id !== projectId) return project;
    return {
      ...project,
      streams: (project.streams || []).map(stream => {
        if (stream.id !== streamId) return stream;
        return {
          ...stream,
          deadlines: (stream.deadlines || []).filter(dl => dl.id !== deadlineId)
        };
      })
    };
  });
  saveProjects(updatedProjects);
}

// 删除流程条
function removeStream(projectId, streamId) {
  const updatedProjects = projects.map(project => {
    if (project.id !== projectId) return project;
    return {
      ...project,
      streams: (project.streams || []).filter(stream => stream.id !== streamId)
    };
  });
  saveProjects(updatedProjects);
}

function getTimelineWindow() {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - 3);
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + timelineRangeWeeks * 7);
  return { windowStart, windowEnd };
}

function buildWeekLabels(startDate, weeks) {
  const labels = [];
  for (let i = 0; i < weeks; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i * 7);
    labels.push(formatWeekLabel(date));
  }
  return labels;
}

function formatWeekLabel(date) {
  return `${date.getMonth() + 1}.${date.getDate()}`;
}

function formatDateShort(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatProjectRange(start, end) {
  const startDate = start ? new Date(start) : new Date();
  const endDate = end ? new Date(end) : startDate;
  return `${formatDateShort(startDate)} - ${formatDateShort(endDate)}`;
}

function formatInputDateHint(value) {
  if (!value) {
    return new Date().toISOString().split('T')[0];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().split('T')[0];
  }
  return date.toISOString().split('T')[0];
}

function parseDateInput(input, fallbackDate) {
  if (!input) return new Date(fallbackDate);
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(fallbackDate);
  }
  return parsed;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function handleAddStream(projectId) {
  if (!projects) {
    projects = [];
  }
  let project = null;
  if (projectId) {
    project = projects.find(p => p.id === projectId);
  } else if (projects.length > 0) {
    project = projects[0];
  }
  if (!project) {
    const now = new Date();
    const defaultEnd = new Date(now.getTime() + DEFAULT_PROJECT_DURATION_DAYS * MS_PER_DAY);
    project = {
      id: createUniqueId('project'),
      name: '未命名项目',
      startDate: now.toISOString(),
      endDate: defaultEnd.toISOString(),
    streams: []
  };
    projects = [project];
    saveProjects(projects, { silent: true });
  }
  const resolvedProjectId = project.id;
  const projectStart = project.startDate ? new Date(project.startDate) : new Date();
  const fallbackEnd = new Date(projectStart.getTime() + DEFAULT_PROJECT_DURATION_DAYS * MS_PER_DAY);
  const projectEnd = project.endDate ? new Date(project.endDate) : fallbackEnd;
  const now = new Date();
  const startMs = Math.min(
    Math.max(now.getTime(), projectStart.getTime()),
    projectEnd.getTime()
  );
  let endMs = Math.min(
    projectEnd.getTime(),
    startMs + DEFAULT_STREAM_DURATION_DAYS * MS_PER_DAY
  );
  if (endMs <= startMs) {
    endMs = startMs + STREAM_MIN_DURATION_MS;
  }
  // 为新流程条分配颜色（根据现有流程条数量循环使用预设颜色）
  const existingStreams = project.streams || [];
  const colorIndex = existingStreams.length % STREAM_COLOR_PRESETS.length;
  const newStream = {
    id: createUniqueId('stream'),
    label: '未命名流程',
    startDate: new Date(startMs).toISOString(),
    endDate: new Date(endMs).toISOString(),
    color: colorIndex // 分配颜色
  };
  const updatedProjects = projects.map(p => {
    if (p.id !== resolvedProjectId) return p;
    return {
      ...p,
      streams: [...(p.streams || []), newStream]
    };
  });
  saveProjects(updatedProjects);
}

function showNewDayToast(message, options = {}) {
  const { autoHide = 2000 } = options;
  let toast = document.getElementById('newDayToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'newDayToast';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  if (newDayToastTimer) {
    clearTimeout(newDayToastTimer);
  }
  if (autoHide > 0) {
    newDayToastTimer = setTimeout(() => {
      toast.classList.remove('show');
      newDayToastTimer = null;
    }, autoHide);
  } else {
    newDayToastTimer = null;
  }
}

function hideNewDayToast() {
  const toast = document.getElementById('newDayToast');
  if (toast) {
    toast.classList.remove('show');
  }
  if (newDayToastTimer) {
    clearTimeout(newDayToastTimer);
    newDayToastTimer = null;
  }
}

function handleNewDayPressStart(event) {
  if (!newDayBtn) return;
  if (event.type === 'mousedown' && event.button !== 0) {
    return;
  }
  event.preventDefault();
  if (newDayPressTimer) {
    clearTimeout(newDayPressTimer);
  }
  newDayBtn.classList.add('pressing');
  showNewDayToast('Wow new day coming……', { autoHide: 0 });
  newDayPressTimer = setTimeout(() => {
    newDayBtn.classList.remove('pressing');
    newDayPressTimer = null;
    showNewDayToast('Wow new day coming……');
    startNewDay();
  }, NEW_DAY_LONG_PRESS_DURATION);
}

function handleNewDayPressEnd() {
  if (newDayPressTimer) {
    clearTimeout(newDayPressTimer);
    newDayPressTimer = null;
  }
  if (newDayBtn) {
    newDayBtn.classList.remove('pressing');
  }
  hideNewDayToast();
}

function initNewDayLongPress() {
  if (!newDayBtn) return;
  
  const handleGlobalMouseUp = () => handleNewDayPressEnd();
  const handleGlobalTouchEnd = () => handleNewDayPressEnd();
  
  newDayBtn.addEventListener('mousedown', handleNewDayPressStart);
  newDayBtn.addEventListener('touchstart', handleNewDayPressStart, { passive: false });
  
  ['mouseup', 'touchend', 'touchcancel'].forEach(eventName => {
    newDayBtn.addEventListener(eventName, handleNewDayPressEnd);
  });
  
  document.addEventListener('mouseup', handleGlobalMouseUp);
  document.addEventListener('touchend', handleGlobalTouchEnd);
  document.addEventListener('touchcancel', handleGlobalTouchEnd);
}

// Add a new todo
function addTodo() {
  const text = todoInput.value.trim();
  if (text === '') {
    todoInput.focus();
    return;
  }

  const todo = {
    id: Date.now(),
    text: text,
    completed: false,
    createdAt: new Date().toISOString(),
    subtasks: [],
    expanded: false
  };

  todos.unshift(todo);
  saveTodos();
  todoInput.value = '';
  todoInput.focus();
}

// Toggle todo completion status
function toggleTodo(id) {
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.completed = !todo.completed;
    // If completing parent, complete all subtasks
    if (todo.completed && todo.subtasks) {
      todo.subtasks.forEach(subtask => {
        subtask.completed = true;
      });
    }
    saveTodos();
  }
}

// Toggle subtask completion status
function toggleSubtask(parentId, subtaskId) {
  const todo = todos.find(t => t.id === parentId);
  if (todo && todo.subtasks) {
    const subtask = todo.subtasks.find(s => s.id === subtaskId);
    if (subtask) {
      subtask.completed = !subtask.completed;
      // Check if all subtasks are completed to auto-complete parent
      if (subtask.completed && todo.subtasks.every(s => s.completed)) {
        todo.completed = true;
      } else if (!subtask.completed) {
        todo.completed = false;
      }
      saveTodos();
    }
  }
}

// Delete a todo
function deleteTodo(id) {
  todos = todos.filter(t => t.id !== id);
  saveTodos();
}

// Move todo to next day
function moveTodoToNextDay(id) {
  const index = todos.findIndex(t => t.id === id);
  if (index === -1) return;

  const [todo] = todos.splice(index, 1);
  const todoForNextDay = {
    ...todo,
    expanded: false,
    _focusSubtaskInput: false,
    movedToNextDayAt: new Date().toISOString()
  };

  nextDayTodos.unshift(todoForNextDay);
  saveTodos();
}

// Delete a subtask
function deleteSubtask(parentId, subtaskId) {
  const todo = todos.find(t => t.id === parentId);
  if (todo && todo.subtasks) {
    todo.subtasks = todo.subtasks.filter(s => s.id !== subtaskId);
    saveTodos();
  }
}

// Toggle todo expansion (for subtasks)
function toggleTodoExpansion(id) {
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.expanded = !todo.expanded;
    saveTodos();
    renderTodos();
  }
}

// Edit todo text
function editTodo(id, newText) {
  const todo = todos.find(t => t.id === id);
  if (todo && newText.trim() !== '') {
    todo.text = newText.trim();
    saveTodos();
  }
}

// Edit subtask text
function editSubtask(parentId, subtaskId, newText) {
  const todo = todos.find(t => t.id === parentId);
  if (todo && todo.subtasks) {
    const subtask = todo.subtasks.find(s => s.id === subtaskId);
    if (subtask && newText.trim() !== '') {
      subtask.text = newText.trim();
      saveTodos();
    }
  }
}

// Add a subtask
function addSubtask(parentId, text) {
  const todo = todos.find(t => t.id === parentId);
  if (todo) {
    if (!todo.subtasks) {
      todo.subtasks = [];
    }
    if (!todo.expanded) {
      todo.expanded = true; // Auto-expand when adding subtask
    }
    const subtask = {
      id: Date.now() + Math.random(), // Ensure unique ID
      text: text.trim(),
      completed: false,
      createdAt: new Date().toISOString()
    };
    todo.subtasks.push(subtask);
    // Mark for focus after render (so user can continue adding subtasks)
    todo._focusSubtaskInput = true;
    saveTodos();
    renderTodos();
  }
}

// Get filtered todos (now returns all todos)
function getFilteredTodos() {
  return todos;
}

// Render todos list
function renderTodos() {
  const filteredTodos = getFilteredTodos();
  
  if (filteredTodos.length === 0) {
    todoList.style.display = 'none';
    emptyState.classList.add('show');
  } else {
    todoList.style.display = 'block';
    emptyState.classList.remove('show');
  }

  todoList.innerHTML = '';
  
  filteredTodos.forEach(todo => {
    renderTodoItem(todo, false);
  });
  
  // 更新日期显示
  if (activeView === 'tasks') {
    updateCurrentDateDisplay();
  }
}

// Render a single todo item (can be main todo or subtask)
function renderTodoItem(todo, isSubtask = false) {
  const li = document.createElement('li');
  li.className = `todo-item ${todo.completed ? 'completed' : ''} ${isSubtask ? 'subtask' : ''}`;
  li.dataset.id = todo.id;
  
  // Add drag functionality for main todos only (not subtasks)
  if (!isSubtask) {
    li.draggable = true;
    li.classList.add('draggable');
    
    // Prevent drag when clicking on interactive elements
    li.addEventListener('mousedown', (e) => {
      // Disable drag if clicking on interactive elements
      if (e.target.tagName === 'BUTTON' || 
          e.target.tagName === 'INPUT' || 
          e.target.closest('.todo-actions') ||
          e.target.closest('.todo-checkbox') ||
          e.target.closest('.expand-btn')) {
        li.draggable = false;
        return;
      }
      // Enable drag for the entire item
      li.draggable = true;
    });
    
    li.addEventListener('dragstart', (e) => {
      // Only start drag if not clicking on interactive elements
      if (e.target.tagName === 'BUTTON' || 
          e.target.tagName === 'INPUT' || 
          e.target.closest('.todo-actions') ||
          e.target.closest('.todo-checkbox') ||
          e.target.closest('.expand-btn')) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', todo.id.toString());
      li.classList.add('dragging');
    });
    
    li.addEventListener('dragend', (e) => {
      li.classList.remove('dragging');
      // Remove all drag-over classes
      document.querySelectorAll('.todo-item.drag-over').forEach(item => {
        item.classList.remove('drag-over');
      });
    });
    
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      const draggingItem = document.querySelector('.todo-item.dragging');
      if (!draggingItem || draggingItem === li) return;
      
      // Remove drag-over from all items
      document.querySelectorAll('.todo-item.drag-over').forEach(item => {
        item.classList.remove('drag-over');
      });
      
      // Only add drag-over to main todos (not subtasks)
      if (!li.classList.contains('subtask')) {
        const rect = li.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        
        if (e.clientY < midY) {
          li.classList.add('drag-over-top');
        } else {
          li.classList.add('drag-over-bottom');
        }
      }
    });
    
    li.addEventListener('dragleave', (e) => {
      li.classList.remove('drag-over-top', 'drag-over-bottom');
    });
    
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      li.classList.remove('drag-over-top', 'drag-over-bottom');
      
      const draggedId = parseInt(e.dataTransfer.getData('text/plain'));
      const draggedIndex = todos.findIndex(t => t.id === draggedId);
      const targetIndex = todos.findIndex(t => t.id === todo.id);
      
      if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
        return;
      }
      
      // Calculate insert position based on mouse position
      const rect = li.getBoundingClientRect();
      const insertBefore = e.clientY < rect.top + rect.height / 2;
      
      // Remove dragged item from array
      const [draggedTodo] = todos.splice(draggedIndex, 1);
      
      // Calculate new index after removal
      let newIndex;
      if (draggedIndex < targetIndex) {
        // Dragged item was before target, target index decreased by 1
        newIndex = insertBefore ? targetIndex - 1 : targetIndex;
      } else {
        // Dragged item was after target, target index unchanged
        newIndex = insertBefore ? targetIndex : targetIndex + 1;
      }
      
      // Insert at new position
      todos.splice(newIndex, 0, draggedTodo);
      
      saveTodos();
    });
  }
  
  // Checkbox
  const checkbox = document.createElement('div');
  checkbox.className = `todo-checkbox ${todo.completed ? 'checked' : ''}`;
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isSubtask) {
      toggleSubtask(todo.parentId, todo.id);
    } else {
      toggleTodo(todo.id);
    }
  });
  
  // Expand/collapse button (for all main todos)
  let expandBtn = null;
  if (!isSubtask) {
    expandBtn = document.createElement('button');
    expandBtn.className = `expand-btn ${todo.expanded ? 'expanded' : ''}`;
    
    // Show arrow only if there are subtasks, otherwise show "+" when collapsed
    if (todo.subtasks && todo.subtasks.length > 0) {
      expandBtn.innerHTML = todo.expanded ? '▼' : '▶';
    } else {
      expandBtn.innerHTML = todo.expanded ? '▼' : '+';
    }
    
    expandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // If has subtasks, just toggle expansion
      if (todo.subtasks && todo.subtasks.length > 0) {
        toggleTodoExpansion(todo.id);
      } else {
        // If no subtasks, toggle expansion and focus input
        showAddSubtaskInput(li, todo.id);
      }
    });
  }
  
  // Text container
  const textContainer = document.createElement('div');
  textContainer.className = 'todo-text-container';
  
  const text = document.createElement('span');
  text.className = 'todo-text';
  text.textContent = todo.text;
  text.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    enterEditMode(text, todo, isSubtask);
  });
  
  const editInput = document.createElement('input');
  editInput.type = 'text';
  editInput.className = 'todo-edit-input';
  editInput.style.display = 'none';
  editInput.value = todo.text;
  editInput.addEventListener('blur', () => {
    exitEditMode(text, editInput, todo, isSubtask);
  });
  editInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      exitEditMode(text, editInput, todo, isSubtask);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      editInput.value = todo.text;
      exitEditMode(text, editInput, todo, isSubtask);
    }
  });
  
  textContainer.appendChild(text);
  textContainer.appendChild(editInput);
  
  // Action buttons container
  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'todo-actions';
  
  // Next day button (only for main todos)
  if (!isSubtask) {
    const nextDayBtn = document.createElement('button');
    nextDayBtn.className = 'next-day-btn';
    nextDayBtn.textContent = 'Next day';
    nextDayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveTodoToNextDay(todo.id);
    });
    actionsContainer.appendChild(nextDayBtn);
  }

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isSubtask) {
      deleteSubtask(todo.parentId, todo.id);
    } else {
      deleteTodo(todo.id);
    }
  });
  
  actionsContainer.appendChild(deleteBtn);
  
  // Assemble the item
  if (expandBtn) li.appendChild(expandBtn);
  li.appendChild(checkbox);
  li.appendChild(textContainer);
  li.appendChild(actionsContainer);
  
  todoList.appendChild(li);
  
  // Render subtasks and input if expanded
  if (!isSubtask && todo.expanded) {
    // Render existing subtasks
    if (todo.subtasks && todo.subtasks.length > 0) {
      todo.subtasks.forEach(subtask => {
        subtask.parentId = todo.id; // Store parent ID for reference
        renderTodoItem(subtask, true);
      });
    }
    
    // Add subtask input field (always shown when expanded)
    const subtaskInputContainer = document.createElement('li');
    subtaskInputContainer.className = 'subtask-input-container';
    subtaskInputContainer.dataset.parentId = todo.id;
    subtaskInputContainer.draggable = false; // Prevent dragging of subtask input container
    const subtaskInput = document.createElement('input');
    subtaskInput.type = 'text';
    subtaskInput.className = 'subtask-input';
    subtaskInput.placeholder = 'Add subtask...';
    subtaskInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const text = subtaskInput.value.trim();
        if (text !== '') {
          addSubtask(todo.id, text);
          subtaskInput.value = '';
          subtaskInput.focus(); // Keep focus after adding
        }
      }
    });
    subtaskInputContainer.appendChild(subtaskInput);
    
    // Auto-focus if marked
    if (todo._focusSubtaskInput) {
      setTimeout(() => {
        subtaskInput.focus();
        todo._focusSubtaskInput = false; // Clear the flag after focusing
      }, 10);
    }
    
    todoList.appendChild(subtaskInputContainer);
  }
}

// Enter edit mode
function enterEditMode(textElement, todo, isSubtask) {
  const container = textElement.parentElement;
  const input = container.querySelector('.todo-edit-input');
  textElement.style.display = 'none';
  input.style.display = 'block';
  input.focus();
  input.select();
}

// Exit edit mode
function exitEditMode(textElement, inputElement, todo, isSubtask) {
  const newText = inputElement.value.trim();
  if (newText !== '' && newText !== todo.text) {
    if (isSubtask) {
      editSubtask(todo.parentId, todo.id, newText);
    } else {
      editTodo(todo.id, newText);
    }
  }
  textElement.style.display = 'block';
  inputElement.style.display = 'none';
}

// Show add subtask input (toggle expansion)
function showAddSubtaskInput(parentLi, parentId) {
  console.log('showAddSubtaskInput called for todo:', parentId);
  const todo = todos.find(t => t.id === parentId);
  if (todo) {
    // Toggle expansion state
    todo.expanded = !todo.expanded;
    
    // If expanding, mark for focus after render
    if (todo.expanded) {
      todo._focusSubtaskInput = true;
    }
    
    saveTodos();
    renderTodos();
  } else {
    console.error('Todo not found:', parentId);
  }
}

// Set filter (no longer needed, but kept for compatibility)
function setFilter(filter) {
  renderTodos();
}

// Event listeners
initNewDayLongPress();

todoInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addTodo();
  }
});

// Filter buttons removed - all todos are shown together

exportBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  exportTodos();
  closeDropdown();
});
importBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  importTodos();
  closeDropdown();
});
historyBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showHistory();
  closeDropdown();
});
settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  showSettings();
  closeDropdown();
});
menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleDropdown();
});
closeModalBtn.addEventListener('click', closeHistoryModal);
clearHistoryBtn.addEventListener('click', clearHistory);
closeSettingsModalBtn.addEventListener('click', closeSettingsModal);

// Header background image upload handlers
if (uploadHeaderBgBtn && headerBgUpload) {
  uploadHeaderBgBtn.addEventListener('click', () => {
    headerBgUpload.click();
  });

  headerBgUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size should be less than 5MB.');
        return;
      }

      // Read file as data URL
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageData = event.target.result;
        saveHeaderBackgroundImage(imageData);
      };
      reader.onerror = () => {
        alert('Failed to read image file.');
      };
      reader.readAsDataURL(file);
    }
  });
}

if (resetHeaderBgBtn) {
  resetHeaderBgBtn.addEventListener('click', () => {
    chrome.storage.sync.remove('headerBackgroundImage', () => {
      resetHeaderBackgroundImage();
    });
  });
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    closeDropdown();
  }
});

document.addEventListener('pointermove', handleStreamPointerMove);
document.addEventListener('pointerup', handleStreamPointerUp);
document.addEventListener('pointercancel', handleStreamPointerUp);

// Close modal when clicking outside
historyModal.addEventListener('click', (e) => {
  if (e.target === historyModal) {
    closeHistoryModal();
  }
});

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) {
    closeSettingsModal();
  }
});

// Background color picker event
if (backgroundColorPicker) {
  backgroundColorPicker.addEventListener('input', (e) => {
    saveBackgroundColor(e.target.value);
  });
  
  backgroundColorPicker.addEventListener('change', (e) => {
    saveBackgroundColor(e.target.value);
  });
}

// Color preset buttons - initialize after DOM is ready
let colorPresetsInitialized = false;
function initColorPresets() {
  if (colorPresetsInitialized) return;
  const colorPresets = document.querySelectorAll('.color-preset');
  colorPresets.forEach(preset => {
    preset.addEventListener('click', () => {
      const color = preset.getAttribute('data-color');
      if (backgroundColorPicker) {
        backgroundColorPicker.value = color;
      }
      saveBackgroundColor(color);
    });
  });
  colorPresetsInitialized = true;
}

if (viewToggleButtons && viewToggleButtons.length > 0) {
  viewToggleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view || 'tasks';
      setActiveView(view);
    });
  });
}

if (timelineRangeSelect) {
  // 更新按钮显示文本
  function updateRangeButtonText() {
    timelineRangeSelect.textContent = `${timelineRangeWeeks}W`;
  }
  
  // 初始化显示
  updateRangeButtonText();
  
  // 点击循环切换：4W -> 8W -> 12W -> 4W
  timelineRangeSelect.addEventListener('click', () => {
    if (timelineRangeWeeks === 4) {
      timelineRangeWeeks = 8;
    } else if (timelineRangeWeeks === 8) {
      timelineRangeWeeks = 12;
    } else {
      timelineRangeWeeks = 4;
    }
    updateRangeButtonText();
    renderProjects();
  });
}

if (addStreamBtn) {
  addStreamBtn.addEventListener('click', () => handleAddStream());
}

if (addStockBtn) {
  addStockBtn.addEventListener('click', () => addStock());
}

// Export todos to JSON file
function exportTodos() {
  const dataStr = JSON.stringify(todos, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `todos-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Import todos from JSON file
function importTodos() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedTodos = JSON.parse(e.target.result);
        if (Array.isArray(importedTodos)) {
          if (confirm(`这将导入 ${importedTodos.length} 个待办事项。是否要替换现有的待办事项？`)) {
            // Normalize imported todos to ensure they have subtasks and expanded fields
            todos = importedTodos.map(todo => ({
              ...todo,
              subtasks: (todo.subtasks || []).map(subtask => ({
                ...subtask
              })),
              expanded: todo.expanded || false
            }));
            saveTodos();
            alert('导入成功！');
          }
        } else {
          alert('导入失败：文件格式不正确');
        }
      } catch (error) {
        alert('导入失败：文件格式错误');
        console.error('Import error:', error);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// Start a new day - archive all current todos and clear the list
function startNewDay() {
  // Add current todos to archived list with archive date
  const archiveDate = new Date().toISOString();
  const todosToArchive = todos.map(todo => ({
    ...todo,
    archivedAt: archiveDate
  }));
  
  // Prepend to archived list (newest first)
  archivedTodos = [...todosToArchive, ...archivedTodos];
  
  // Clear current todos
  todos = nextDayTodos.map(todo => ({
    ...todo,
    subtasks: (todo.subtasks || []).map(subtask => ({ ...subtask })),
    expanded: false
  }));
  nextDayTodos = [];
  
  // Save to storage
  saveTodos();
}

// Dropdown menu functions
function toggleDropdown() {
  dropdownMenu.classList.toggle('show');
}

function closeDropdown() {
  dropdownMenu.classList.remove('show');
}

// History modal functions
function showHistory() {
  renderHistory();
  historyModal.style.display = 'block';
}

function closeHistoryModal() {
  historyModal.style.display = 'none';
}

// Settings modal functions
function showSettings() {
  settingsModal.style.display = 'block';
  // Ensure color presets are initialized when settings modal is shown
  initColorPresets();
}

function closeSettingsModal() {
  settingsModal.style.display = 'none';
}

function clearHistory() {
  if (archivedTodos.length === 0) {
    return;
  }
  
  if (confirm('确定要清除所有历史记录吗？此操作无法撤销。')) {
    archivedTodos = [];
    saveTodos();
    renderHistory();
  }
}

function renderHistory() {
  // Update clear button state
  if (clearHistoryBtn) {
    clearHistoryBtn.disabled = archivedTodos.length === 0;
  }
  
  if (archivedTodos.length === 0) {
    historyContent.innerHTML = '<div class="empty-history"><p>暂无历史记录</p></div>';
    return;
  }

  // Group todos by archive date
  const grouped = {};
  archivedTodos.forEach(todo => {
    const date = new Date(todo.archivedAt);
    // Use ISO date string as key for sorting, then format for display
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const displayDate = formatHistoryDate(date);
    
    if (!grouped[dateKey]) {
      grouped[dateKey] = {
        displayDate: displayDate,
        todos: []
      };
    }
    grouped[dateKey].todos.push(todo);
  });

  // Sort dates (newest first)
  const sortedDates = Object.keys(grouped).sort((a, b) => {
    return new Date(b) - new Date(a);
  });

  // Render grouped history
  let html = '';
  sortedDates.forEach(dateKey => {
    const group = grouped[dateKey];
    html += `<div class="history-group">`;
    html += `<div class="history-date">${group.displayDate}</div>`;
    html += `<ul class="history-todo-list">`;
    
    group.todos.forEach(todo => {
      html += `<li class="history-todo-item ${todo.completed ? 'completed' : ''}">`;
      html += `<span class="history-todo-text">${escapeHtml(todo.text)}</span>`;
      if (todo.completed) {
        html += `<span class="history-status completed">completed</span>`;
      } else {
        html += `<span class="history-status active">active</span>`;
      }
      html += `</li>`;
    });
    
    html += `</ul></div>`;
  });

  historyContent.innerHTML = html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatHistoryDate(date) {
  const day = date.toLocaleString('en-US', { day: '2-digit' });
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.toLocaleString('en-US', { year: '2-digit' });
  const weekday = date.toLocaleString('en-US', { weekday: 'short' });
  return `${day} ${month} ${year}, ${weekday}`;
}

// 格式化当前日期显示（Mon 1 Dec）
function formatCurrentDate(date) {
  const weekday = date.toLocaleString('en-US', { weekday: 'short' });
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'short' });
  return `${weekday} ${day} ${month}`;
}

// 更新日期显示
function updateCurrentDateDisplay() {
  if (currentDateDisplay) {
    const today = new Date();
    currentDateDisplay.textContent = formatCurrentDate(today);
  }
}
 

// Initialize
loadTodos();
initColorPresets();

// 窗口大小改变时，确保项目卡片能够自适应
let resizeTimeout;
function handleWindowResize() {
  // 使用防抖，避免频繁触发
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    const activeIndex = VIEW_SEQUENCE.indexOf(activeView);
    updateViewToggleThumbPosition(activeIndex >= 0 ? activeIndex : 0);
    // 如果当前在项目视图，重新渲染以确保时间线正确适应新尺寸
    if (activeView === 'projects' && projectList) {
      // 时间线使用百分比定位，CSS 会自动适应，但我们可以触发一次重新计算
      // 主要是为了确保拖拽交互中的 msPerPixel 能够正确更新
      const timelineStreams = document.querySelectorAll('.timeline-streams');
      timelineStreams.forEach(streamsContainer => {
        const streams = streamsContainer.querySelectorAll('.timeline-stream');
        streams.forEach(streamNode => {
          const startDate = new Date(streamNode.dataset.startDate);
          const endDate = new Date(streamNode.dataset.endDate);
          const windowStart = new Date(streamsContainer.dataset.windowStart);
          const windowEnd = new Date(streamsContainer.dataset.windowEnd);
          if (startDate && endDate && windowStart && windowEnd) {
            setTimelineStreamPosition(streamNode, startDate, endDate, windowStart, windowEnd);
            updateStreamRangeLabel(streamNode, startDate, endDate);
          }
        });
      });
    }
  }, 150);
}

// 监听窗口大小改变
window.addEventListener('resize', handleWindowResize);

// 全局测试：检查右键事件是否被捕获
document.addEventListener('contextmenu', (e) => {
  const target = e.target;
  const isInTimeline = target.closest('.timeline-streams') || target.closest('.project-timeline');
  if (isInTimeline) {
    console.log('🔍 全局右键事件捕获:', {
      target: target,
      targetTagName: target.tagName,
      targetClassName: target.className,
      closestTimelineStreams: target.closest('.timeline-streams'),
      closestProjectTimeline: target.closest('.project-timeline'),
      clientX: e.clientX,
      clientY: e.clientY
    });
  }
}, true);

// 添加一个更早的全局监听器来测试
window.addEventListener('contextmenu', (e) => {
  console.log('🌐 Window 右键事件（最早）:', {
    target: e.target,
    targetTagName: e.target.tagName,
    targetClassName: e.target.className
  });
}, true);


