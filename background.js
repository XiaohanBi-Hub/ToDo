// Background script for managing the Todo window

let todoWindowId = null;
const WINDOW_WIDTH = 400;
const WINDOW_HEIGHT = 600;

// Listen for window close (set once)
chrome.windows.onRemoved.addListener((closedWindowId) => {
  if (closedWindowId === todoWindowId) {
    todoWindowId = null;
  }
});

// Create or focus the Todo window
chrome.action.onClicked.addListener((tab) => {
  if (todoWindowId) {
    // Check if window still exists
    chrome.windows.get(todoWindowId, (window) => {
      if (chrome.runtime.lastError) {
        // Window was closed, create a new one
        createTodoWindow();
      } else {
        // Window exists, focus it
        chrome.windows.update(todoWindowId, { focused: true });
      }
    });
  } else {
    createTodoWindow();
  }
});

function createTodoWindow() {
  chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'),
    type: 'popup',
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    focused: true
  }, (window) => {
    todoWindowId = window.id;
  });
}


// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getWindowId') {
    sendResponse({ windowId: todoWindowId });
  } else if (request.action === 'updateWindowSize') {
    if (todoWindowId) {
      chrome.windows.update(todoWindowId, {
        width: request.width,
        height: request.height
      }, () => {
        sendResponse({ success: true });
      });
      return true; // Keep channel open for async response
    }
  } else if (request.action === 'focusWindow') {
    if (todoWindowId) {
      chrome.windows.update(todoWindowId, { focused: true });
      sendResponse({ success: true });
    }
  }
  return true;
});

